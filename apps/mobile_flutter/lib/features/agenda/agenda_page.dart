import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../data/company_data_repository.dart';
import '../../data/rental_time.dart';

class AgendaPage extends StatefulWidget {
  const AgendaPage({super.key, required this.companyId});
  final String companyId;

  @override
  State<AgendaPage> createState() => _AgendaPageState();
}

class _AgendaPageState extends State<AgendaPage> {
  late final CompanyDataRepository _repository = CompanyDataRepository(
    client: Supabase.instance.client,
    companyId: widget.companyId,
  );
  late Future<List<Map<String, dynamic>>> _future = _repository.fetchRentals();
  DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);
  DateTime _selected = DateTime(DateTime.now().year, DateTime.now().month, DateTime.now().day);

  static const _months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];
  static const _weekdays = [
    'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira',
    'sexta-feira', 'sábado', 'domingo',
  ];

  DateTime _day(DateTime value) => DateTime(value.year, value.month, value.day);

  void _changeMonth(int offset) {
    final next = DateTime(_month.year, _month.month + offset);
    final lastDay = DateTime(next.year, next.month + 1, 0).day;
    setState(() {
      _month = next;
      _selected = DateTime(next.year, next.month, _selected.day.clamp(1, lastDay).toInt());
    });
  }
  DateTime? _parseDate(dynamic value) => DateTime.tryParse(value?.toString() ?? '');

  bool _containsDay(Map<String, dynamic> rental, DateTime date) {
    if (rental['status'] == 'cancelled') return false;
    final start = _parseDate(rental['start_date']);
    final end = _parseDate(rental['end_date']) ?? start;
    if (start == null || end == null) return false;
    final selected = _day(date);
    return !selected.isBefore(_day(start)) && !selected.isAfter(_day(end));
  }

  List<Map<String, dynamic>> _forDay(List<Map<String, dynamic>> rentals, DateTime date) =>
      rentals.where((rental) => _containsDay(rental, date)).toList()
        ..sort((a, b) => (a['start_time'] ?? '').toString().compareTo((b['start_time'] ?? '').toString()));

  Future<void> _reload() async {
    final next = _repository.fetchRentals();
    setState(() => _future = next);
    await next;
  }

  String _dateRange(Map<String, dynamic> rental) {
    final start = _parseDate(rental['start_date']);
    final end = _parseDate(rental['end_date']);
    if (start == null) return 'Período não informado';
    final startTime = normalizeRentalTime(rental['start_time'], '');
    final endTime = normalizeRentalTime(rental['end_time'], '');
    return '${DateFormat('dd/MM/yyyy').format(start)} ${startTime.isEmpty ? '' : startTime} a '
        '${end == null ? '—' : DateFormat('dd/MM/yyyy').format(end)} ${endTime.isEmpty ? '' : end}';
  }

  String _status(String value) => switch (value) {
    'pending' => 'Pendente',
    'confirmed' => 'Confirmada',
    'ongoing' => 'Em andamento',
    'completed' => 'Concluída',
    'cancelled' => 'Cancelada',
    _ => value,
  };

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Agenda'), actions: [
      IconButton(tooltip: 'Atualizar', onPressed: _reload, icon: const Icon(Icons.refresh)),
    ]),
    body: FutureBuilder<List<Map<String, dynamic>>>(
      future: _future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
        if (snapshot.hasError) return Center(child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('Não foi possível carregar a agenda. ${snapshot.error}', textAlign: TextAlign.center),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: _reload, child: const Text('Tentar novamente')),
          ]),
        ));
        final rentals = snapshot.data ?? [];
        final active = rentals.where((r) => r['status'] != 'cancelled').toList();
        final selectedRentals = _forDay(rentals, _selected);
        final monthRentals = active.where((r) {
          final start = _parseDate(r['start_date']);
          final end = _parseDate(r['end_date']) ?? start;
          if (start == null || end == null) return false;
          final first = DateTime(_month.year, _month.month, 1);
          final last = DateTime(_month.year, _month.month + 1, 0);
          return !end.isBefore(first) && !start.isAfter(last);
        }).length;
        return RefreshIndicator(
          onRefresh: _reload,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
            children: [
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                Text('${_months[_month.month - 1]} ${_month.year}', style: Theme.of(context).textTheme.titleLarge),
                Row(children: [
                  IconButton(onPressed: () => _changeMonth(-1), icon: const Icon(Icons.chevron_left)),
                  IconButton(onPressed: () => _changeMonth(1), icon: const Icon(Icons.chevron_right)),
                ]),
              ]),
              Card(child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(children: [
                  Row(children: const ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((day) => Expanded(
                    child: Center(child: Text(day, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 12))),
                  )).toList()),
                  const SizedBox(height: 8),
                  Builder(builder: (context) {
                    final first = DateTime(_month.year, _month.month, 1);
                    final offset = first.weekday - 1;
                    final count = DateTime(_month.year, _month.month + 1, 0).day;
                    final cells = <Widget>[
                      for (var i = 0; i < offset; i++) const SizedBox.shrink(),
                      for (var day = 1; day <= count; day++)
                        _calendarDay(rentals, DateTime(_month.year, _month.month, day)),
                    ];
                    return GridView.count(
                      crossAxisCount: 7,
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      childAspectRatio: 0.9,
                      children: cells,
                    );
                  }),
                ]),
              )),
              const SizedBox(height: 8),
              Row(children: [
                Expanded(child: _metric('Reservas no mês', monthRentals.toString())),
                const SizedBox(width: 8),
                Expanded(child: _metric('Reservas no dia', selectedRentals.length.toString())),
              ]),
              const SizedBox(height: 18),
              Text('${_weekdays[_selected.weekday - 1]}, ${DateFormat('dd/MM/yyyy').format(_selected)}', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              if (selectedRentals.isEmpty)
                const Padding(padding: EdgeInsets.all(22), child: Center(child: Text('Nenhuma reserva neste dia.')))
              else
                ...selectedRentals.map(_rentalCard),
            ],
          ),
        );
      },
    ),
  );

  Widget _calendarDay(List<Map<String, dynamic>> rentals, DateTime date) {
    final count = _forDay(rentals, date).length;
    final selected = _day(date) == _selected;
    final today = _day(date) == _day(DateTime.now());
    return Padding(
      padding: const EdgeInsets.all(2),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () => setState(() => _selected = _day(date)),
        child: Container(
          decoration: BoxDecoration(
            color: selected ? Theme.of(context).colorScheme.primaryContainer : null,
            borderRadius: BorderRadius.circular(10),
            border: today ? Border.all(color: Theme.of(context).colorScheme.primary, width: 1.3) : null,
          ),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Text('${date.day}', style: TextStyle(fontWeight: selected || today ? FontWeight.bold : FontWeight.normal)),
            const SizedBox(height: 3),
            if (count > 0) Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              decoration: BoxDecoration(color: Theme.of(context).colorScheme.primary, borderRadius: BorderRadius.circular(9)),
              child: Text('$count', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
            ) else const SizedBox(height: 13),
          ]),
        ),
      ),
    );
  }

  Widget _metric(String label, String value) => Card(child: Padding(
    padding: const EdgeInsets.all(13),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: Theme.of(context).textTheme.labelMedium),
      const SizedBox(height: 5),
      Text(value, style: Theme.of(context).textTheme.titleLarge),
    ]),
  ));

  Widget _rentalCard(Map<String, dynamic> rental) {
    final customer = (rental['customers'] as Map?)?['name']?.toString() ?? 'Cliente';
    final items = (rental['rental_items'] as List? ?? []).whereType<Map>().map((item) =>
      (item['products'] as Map?)?['name']?.toString() ?? 'Brinquedo').join(', ');
    return Card(
      child: ListTile(
        leading: const CircleAvatar(child: Icon(Icons.event_note_outlined)),
        title: Text(customer),
        subtitle: Text('${_dateRange(rental)}\n${items.isEmpty ? 'Itens não informados' : items}\nStatus: ${_status(rental['status']?.toString() ?? '')}'),
        isThreeLine: true,
        trailing: Text('R\$ ${(rental['total_amount'] as num? ?? 0).toStringAsFixed(2)}'),
      ),
    );
  }
}
