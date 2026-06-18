import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'api.dart';
import 'strings.dart';
import 'screens.dart';

void main() => runApp(const FarmosApp());

/// App-wide session + locale, kept deliberately simple (no extra state libs).
class AppState extends InheritedWidget {
  const AppState({
    super.key,
    required this.api,
    required this.farmerId,
    required this.farmerName,
    required this.locale,
    required this.setLocale,
    required this.setFarmer,
    required super.child,
  });

  final FarmosApi api;
  final String? farmerId;
  final String? farmerName;
  final Locale locale;
  final void Function(Locale) setLocale;
  final void Function(String id, String name) setFarmer;

  static AppState of(BuildContext c) => c.dependOnInheritedWidgetOfExactType<AppState>()!;

  @override
  bool updateShouldNotify(AppState old) =>
      farmerId != old.farmerId || locale != old.locale;
}

class FarmosApp extends StatefulWidget {
  const FarmosApp({super.key});
  @override
  State<FarmosApp> createState() => _FarmosAppState();
}

class _FarmosAppState extends State<FarmosApp> {
  final _api = FarmosApi();
  Locale _locale = const Locale('en');
  String? _farmerId;
  String? _farmerName;

  @override
  Widget build(BuildContext context) {
    return AppState(
      api: _api,
      farmerId: _farmerId,
      farmerName: _farmerName,
      locale: _locale,
      setLocale: (l) => setState(() => _locale = l),
      setFarmer: (id, name) => setState(() {
        _farmerId = id;
        _farmerName = name;
      }),
      child: MaterialApp(
        title: 'FarmOS',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorSchemeSeed: const Color(0xFF2E7D32),
          useMaterial3: true,
        ),
        locale: _locale,
        supportedLocales: S.supported,
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: _farmerId == null ? const RegisterScreen() : const HomeScreen(),
      ),
    );
  }
}
