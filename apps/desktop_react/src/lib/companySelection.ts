import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type CompanyOption = { id: string; name: string };
export type ActiveCompany = CompanyOption & { role: string };

export type CompanyAccess =
  | {
      kind: 'platform-owner';
      companies: CompanyOption[];
      selectedCompany: ActiveCompany | null;
      diagnostic: string;
    }
  | {
      kind: 'member';
      companies: [];
      selectedCompany: ActiveCompany;
      diagnostic: string;
    };

function describeAccount(session: Session): string {
  return session.user.email ?? 'e-mail indisponível';
}

/**
 * Resolve access from the authenticated account on the server.
 * A platform owner never inherits the first company in the list:
 * only an explicit, timestamped preference can restore an active company.
 */
export async function resolveCompanyAccess(session: Session): Promise<CompanyAccess> {
  const { data: isPlatformOwner, error: ownerError } = await supabase.rpc('is_platform_owner');
  if (ownerError) throw ownerError;

  if (isPlatformOwner === true) {
    const { data, error } = await supabase
      .from('companies')
      .select('id, name')
      .order('name', { ascending: true });
    if (error) throw error;

    const companies = (data ?? []) as CompanyOption[];
    if (!companies.length) {
      return {
        kind: 'platform-owner',
        companies,
        selectedCompany: null,
        diagnostic: 'Perfil global confirmado; nenhuma empresa cadastrada.',
      };
    }

    // Read fresh server-side user data, not a possibly stale session snapshot.
    const { data: userResult, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!userResult.user || userResult.user.id !== session.user.id) {
      throw new Error('A conta autenticada mudou durante a verificação de acesso. Entre novamente.');
    }

    const metadata = userResult.user.user_metadata ?? {};
    const preferredId = typeof metadata.kidsloc_selected_company_id === 'string'
      ? metadata.kidsloc_selected_company_id
      : '';
    const selectedAt = typeof metadata.kidsloc_selected_company_at === 'string'
      ? metadata.kidsloc_selected_company_at
      : '';
    const timestamp = Date.parse(selectedAt);
    const hasExplicitPreference = Boolean(preferredId && selectedAt && Number.isFinite(timestamp));
    const selected = hasExplicitPreference
      ? companies.find(company => company.id === preferredId) ?? null
      : null;
    const preferenceStatus = !preferredId
      ? 'nenhuma escolha salva'
      : !hasExplicitPreference
        ? 'preferência incompleta ignorada'
        : selected
          ? 'escolha confirmada'
          : 'empresa salva não está mais disponível';

    return {
      kind: 'platform-owner',
      companies,
      selectedCompany: selected ? { ...selected, role: 'owner' } : null,
      diagnostic: [
        'Conta: ' + describeAccount(session),
        'Perfil global: confirmado',
        'Preferência: ' + preferenceStatus,
        'Empresa ativa: ' + (selected?.name ?? 'nenhuma'),
      ].join(' · '),
    };
  }

  const { data: member, error: memberError } = await supabase
    .from('company_members')
    .select('company_id, role')
    .eq('user_id', session.user.id)
    .limit(1)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!member) {
    throw new Error('Esta conta ainda não está vinculada a uma empresa. Peça ao proprietário para conferir seu acesso.');
  }

  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('id, name')
    .eq('id', member.company_id)
    .single();
  if (companyError) throw companyError;

  const selectedCompany = { id: company.id, name: company.name, role: member.role };
  return {
    kind: 'member',
    companies: [],
    selectedCompany,
    diagnostic: [
      'Conta: ' + describeAccount(session),
      'Perfil global: não',
      'Vínculo: ' + member.role,
      'Empresa ativa: ' + company.name,
    ].join(' · '),
  };
}

/** Persist and read back the explicit choice before activating the company. */
export async function persistCompanySelection(
  session: Session,
  company: CompanyOption,
): Promise<{ selectedAt: string; user: User }> {
  const selectedAt = new Date().toISOString();
  const { data, error } = await supabase.auth.updateUser({
    data: {
      ...(session.user.user_metadata ?? {}),
      kidsloc_selected_company_id: company.id,
      kidsloc_selected_company_at: selectedAt,
    },
  });
  if (error) throw error;
  if (!data.user || data.user.id !== session.user.id) {
    throw new Error('O servidor não confirmou a conta que fez a seleção.');
  }

  // Confirm against a fresh server read; do not trust only the optimistic UI state.
  const { data: fresh, error: freshError } = await supabase.auth.getUser();
  if (freshError) throw freshError;
  const savedId = fresh.user?.user_metadata?.kidsloc_selected_company_id;
  const savedAt = fresh.user?.user_metadata?.kidsloc_selected_company_at;
  if (
    fresh.user?.id !== session.user.id
    || savedId !== company.id
    || savedAt !== selectedAt
  ) {
    throw new Error('A seleção não foi confirmada pelo servidor. Tente novamente.');
  }

  return { selectedAt, user: fresh.user };
}
