import 'package:flutter/material.dart';
import 'strings.dart';
import 'main.dart';

// --- Registration / onboarding ---
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});
  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  bool _busy = false;
  String? _err;

  Future<void> _submit() async {
    final app = AppState.of(context);
    setState(() {
      _busy = true;
      _err = null;
    });
    try {
      final r = await app.api.createFarmer(
        _name.text.trim(),
        _phone.text.trim(),
        app.locale.languageCode,
      );
      app.setFarmer(r['farmer_id'] as String, _name.text.trim());
    } catch (e) {
      setState(() => _err = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final app = AppState.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(s.t('app_title')),
        actions: [_LangMenu(onPick: app.setLocale)],
      ),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.agriculture, size: 72, color: Color(0xFF2E7D32)),
            const SizedBox(height: 24),
            TextField(
              controller: _name,
              decoration: InputDecoration(labelText: s.t('name'), border: const OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(labelText: s.t('phone'), border: const OutlineInputBorder()),
            ),
            if (_err != null) ...[
              const SizedBox(height: 12),
              Text(_err!, style: const TextStyle(color: Colors.red)),
            ],
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _busy ? null : _submit,
                child: _busy
                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(s.t('register')),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// --- Home with bottom navigation ---
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tab = 0;
  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final app = AppState.of(context);
    final pages = [const FieldsScreen(), const ScoresScreen()];
    return Scaffold(
      appBar: AppBar(
        title: Text('${s.t('my_farm')} — ${app.farmerName ?? ''}'),
        actions: [
          _LangMenu(onPick: app.setLocale),
          IconButton(
            icon: const Icon(Icons.logout, color: Colors.redAccent),
            tooltip: 'Log Out',
            onPressed: () => app.setFarmer(null, null),
          ),
        ],
      ),
      body: pages[_tab],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: [
          NavigationDestination(icon: const Icon(Icons.grass), label: s.t('fields')),
          NavigationDestination(icon: const Icon(Icons.analytics), label: s.t('scores')),
        ],
      ),
    );
  }
}

// --- Fields list + add ---
class FieldsScreen extends StatefulWidget {
  const FieldsScreen({super.key});
  @override
  State<FieldsScreen> createState() => _FieldsScreenState();
}

class _FieldsScreenState extends State<FieldsScreen> {
  late Future<List<dynamic>> _future;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _future = AppState.of(context).api.fields(AppState.of(context).farmerId!);
  }

  void _reload() => setState(() {
        _future = AppState.of(context).api.fields(AppState.of(context).farmerId!);
      });

  Future<void> _addField() async {
    final app = AppState.of(context);
    // Demo polygon: a small square. A real app captures GPS / map-drawn polygon.
    const lng = 78.0, lat = 12.0;
    final ring = [
      [lng, lat],
      [lng + 0.003, lat],
      [lng + 0.003, lat + 0.003],
      [lng, lat + 0.003],
      [lng, lat],
    ];
    try {
      await app.api.createField(farmerId: app.farmerId!, ring: ring, waterType: 'borewell');
      _reload();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    return Scaffold(
      body: FutureBuilder<List<dynamic>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) return Center(child: Text('${snap.error}'));
          final fields = snap.data ?? [];
          if (fields.isEmpty) return Center(child: Text(s.t('no_fields')));
          return ListView.separated(
            itemCount: fields.length,
            separatorBuilder: (context, index) => const Divider(height: 1),
            itemBuilder: (_, i) {
              final f = fields[i] as Map<String, dynamic>;
              return ListTile(
                leading: const Icon(Icons.crop_square, color: Color(0xFF2E7D32)),
                title: Text(f['passport_no'] as String),
                subtitle: Text('${s.t('area')}: ${f['area_ha']} ha'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => FieldDetailScreen(field: f)),
                ),
              );
            },
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _addField,
        icon: const Icon(Icons.add_location_alt),
        label: Text(s.t('add_field')),
      ),
    );
  }
}

// --- Field detail: passport + score + advisory + crop reco ---
class FieldDetailScreen extends StatefulWidget {
  const FieldDetailScreen({super.key, required this.field});
  final Map<String, dynamic> field;
  @override
  State<FieldDetailScreen> createState() => _FieldDetailScreenState();
}

class _FieldDetailScreenState extends State<FieldDetailScreen> {
  Map<String, dynamic>? _score;
  Map<String, dynamic>? _advisory;
  Map<String, dynamic>? _reco;
  bool _busy = false;

  String get _fieldId => widget.field['field_id'] as String;

  Future<void> _run(Future<void> Function() fn) async {
    setState(() => _busy = true);
    try {
      await fn();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = S.of(context);
    final api = AppState.of(context).api;
    return Scaffold(
      appBar: AppBar(title: Text(widget.field['passport_no'] as String)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Scores
          _Section(
            title: s.t('scores'),
            child: _score == null
                ? OutlinedButton(
                    onPressed: _busy ? null : () => _run(() async {
                      final r = await api.scoreField(_fieldId);
                      setState(() => _score = r);
                    }),
                    child: Text(s.t('scores')),
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _ScoreBar(label: s.t('credit_score'), value: (_score!['credit']['value'] as num).toDouble(), suffix: ' (${_score!['credit']['band']})'),
                      _ScoreBar(label: s.t('farm_risk'), value: (_score!['farm_risk']['value'] as num).toDouble(), danger: true),
                    ],
                  ),
          ),
          // Advisory
          _Section(
            title: s.t('advisory'),
            child: _advisory == null
                ? OutlinedButton(
                    onPressed: _busy ? null : () => _run(() async {
                      // Demo weather; a real app pulls IMD/forecast for the field.
                      final r = await api.advisory(_fieldId, {'rainfall_mm': 80, 'tmax': 39, 'humidity': 82, 'wind_kmph': 20});
                      setState(() => _advisory = r);
                    }),
                    child: Text(s.t('check_weather')),
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Rs ${_advisory!['total_rupees_at_risk']} ${s.t('at_risk')}',
                          style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.red)),
                      const SizedBox(height: 8),
                      ...((_advisory!['alerts'] as List).map((a) => ListTile(
                            dense: true,
                            leading: Icon(_severityIcon(a['severity'] as String)),
                            title: Text(a['title'] as String),
                            subtitle: Text(a['action'] as String),
                          ))),
                    ],
                  ),
          ),
          // Crop reco
          _Section(
            title: s.t('crop_reco'),
            child: _reco == null
                ? OutlinedButton(
                    onPressed: _busy ? null : () => _run(() async {
                      final r = await api.cropReco(_fieldId, 'rabi');
                      setState(() => _reco = r);
                    }),
                    child: Text(s.t('crop_reco')),
                  )
                : Column(
                    children: ((_reco!['recommendations'] as List).map((c) => ListTile(
                          dense: true,
                          leading: const Icon(Icons.eco, color: Color(0xFF2E7D32)),
                          title: Text(c['crop'] as String),
                          subtitle: Text('Profit/ha Rs ${c['expected_profit_per_ha']} • risk ${c['risk']}'),
                        ))).toList(),
                  ),
          ),
        ],
      ),
    );
  }

  IconData _severityIcon(String sev) => switch (sev) {
        'critical' => Icons.warning,
        'warning' => Icons.error_outline,
        _ => Icons.info_outline,
      };
}

// --- Scores tab: ERP summary + seller status ---
class ScoresScreen extends StatefulWidget {
  const ScoresScreen({super.key});
  @override
  State<ScoresScreen> createState() => _ScoresScreenState();
}

class _ScoresScreenState extends State<ScoresScreen> {
  Map<String, dynamic>? _erp;
  Map<String, dynamic>? _seller;
  bool _loaded = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_loaded) {
      _loaded = true;
      final app = AppState.of(context);
      app.api.erpSummary(app.farmerId!).then((v) => setState(() => _erp = v)).catchError((_) {});
      app.api.sellerStatus(app.farmerId!).then((v) => setState(() => _seller = v)).catchError((_) {});
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _Section(
          title: 'Farm Income / Expense',
          child: _erp == null
              ? const Center(child: CircularProgressIndicator())
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Income: Rs ${_erp!['income']}'),
                    Text('Expense: Rs ${_erp!['expense']}'),
                    Text('Net profit: Rs ${_erp!['net_profit']}',
                        style: const TextStyle(fontWeight: FontWeight.bold)),
                  ],
                ),
        ),
        _Section(
          title: 'Marketplace status',
          child: _seller == null
              ? const Center(child: CircularProgressIndicator())
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Respect Points: ${_seller!['respect_points']} / ${_seller!['threshold']}'),
                    Text('Trust tier: ${_seller!['trust_tier']}'),
                    Text(
                      (_seller!['sell_enabled'] as bool) ? 'Selling: UNLOCKED' : 'Selling: locked',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        color: (_seller!['sell_enabled'] as bool) ? Colors.green : Colors.orange,
                      ),
                    ),
                  ],
                ),
        ),
      ],
    );
  }
}

// --- small reusable widgets ---
class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child});
  final String title;
  final Widget child;
  @override
  Widget build(BuildContext context) => Card(
        margin: const EdgeInsets.only(bottom: 16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              child,
            ],
          ),
        ),
      );
}

class _ScoreBar extends StatelessWidget {
  const _ScoreBar({required this.label, required this.value, this.suffix = '', this.danger = false});
  final String label;
  final double value;
  final String suffix;
  final bool danger;
  @override
  Widget build(BuildContext context) {
    final pct = (value / 100).clamp(0.0, 1.0);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$label: ${value.toStringAsFixed(0)}$suffix'),
          const SizedBox(height: 4),
          LinearProgressIndicator(
            value: pct,
            color: danger ? Colors.red : Colors.green,
            backgroundColor: Colors.grey.shade300,
          ),
        ],
      ),
    );
  }
}

class _LangMenu extends StatelessWidget {
  const _LangMenu({required this.onPick});
  final void Function(Locale) onPick;
  @override
  Widget build(BuildContext context) => PopupMenuButton<Locale>(
        icon: const Icon(Icons.language),
        onSelected: onPick,
        itemBuilder: (_) => const [
          PopupMenuItem(value: Locale('en'), child: Text('English')),
          PopupMenuItem(value: Locale('hi'), child: Text('हिन्दी')),
          PopupMenuItem(value: Locale('ta'), child: Text('தமிழ்')),
        ],
      );
}
