const fs = require('node:fs');

const sources = [
  {
    label: 'React',
    path: 'apps/desktop_react/src/data/companyDataRepository.ts',
    expected: "'products(name), rental_item_units(product_unit_id, product_units(asset_code))), ' +\n          'rental_responsibles(user_id, employee_name_snapshot)',",
  },
  {
    label: 'Flutter',
    path: 'apps/mobile_flutter/lib/data/company_data_repository.dart',
    expected: "'products(name), rental_item_units(product_unit_id, product_units(asset_code))), '\n          'rental_responsibles(user_id, employee_name_snapshot)',",
  },
];

for (const source of sources) {
  const content = fs.readFileSync(source.path, 'utf8');
  if (!content.includes(source.expected)) {
    throw new Error(`FAIL ${source.label}: rental_responsibles must be embedded from rentals, outside rental_items.`);
  }
  if (content.includes('rental_responsibles(user_id, employee_name_snapshot))')) {
    throw new Error(`FAIL ${source.label}: found the previous incorrectly nested rental_responsibles relation.`);
  }
  console.log(`PASS ${source.label}: rental_items and rental_responsibles are embedded at the correct relationship levels.`);
}

const stateGuards = [
  {
    label: 'Rentals',
    path: 'apps/desktop_react/src/data/RentalsPage.tsx',
    expected: 'try {\\n        const { data: auth, error: authError } = await supabase.auth.getUser();',
  },
  {
    label: 'Occurrences',
    path: 'apps/desktop_react/src/data/OccurrencesPage.tsx',
    expected: 'setLoading(true); setError(\\'\\');\\n    try {\\n      const { data: auth, error: authError } = await supabase.auth.getUser();',
  },
  {
    label: 'Contracts',
    path: 'apps/desktop_react/src/data/ContractsPage.tsx',
    expected: 'try {\\n      const [r, c] = await Promise.all([',
  },
];

for (const guard of stateGuards) {
  const source = fs.readFileSync(guard.path, 'utf8');
  if (!source.includes(guard.expected)) {
    throw new Error(`FAIL ${guard.label}: async load path must handle failures without leaving the screen loading forever.`);
  }
  console.log(`PASS ${guard.label}: async load path has explicit failure handling.`);
}
