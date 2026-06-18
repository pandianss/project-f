import 'dart:convert';
import 'package:http/http.dart' as http;

/// Fasal Mitra AI — core API client.
///
/// Base URL precedence: explicit constructor arg > --dart-define=API_BASE_URL >
/// dev default. For production builds pass your public HTTPS API, e.g.:
///   flutter build appbundle --release --dart-define=API_BASE_URL=https://api.fasalmitra.ai
/// Android-emulator dev default is 10.0.2.2 (the host machine), backend on :3001.
const String _kBaseUrlFromEnv =
    String.fromEnvironment('API_BASE_URL', defaultValue: '');

class FarmosApi {
  FarmosApi({String? baseUrl})
      : baseUrl = baseUrl ??
            (_kBaseUrlFromEnv.isNotEmpty ? _kBaseUrlFromEnv : 'http://10.0.2.2:3001');

  final String baseUrl;
  final http.Client _client = http.Client();

  Uri _u(String path, [Map<String, dynamic>? q]) => Uri.parse('$baseUrl$path').replace(
        queryParameters: q?.map((k, v) => MapEntry(k, '$v')),
      );

  Future<dynamic> _get(String path, [Map<String, dynamic>? q]) async {
    final r = await _client.get(_u(path, q));
    return _decode(r);
  }

  Future<dynamic> _post(String path, Map<String, dynamic> body) async {
    final r = await _client.post(
      _u(path),
      headers: {'content-type': 'application/json'},
      body: jsonEncode(body),
    );
    return _decode(r);
  }

  dynamic _decode(http.Response r) {
    final body = r.body.isEmpty ? null : jsonDecode(r.body);
    if (r.statusCode >= 400) {
      final msg = body is Map ? (body['error'] ?? body.toString()) : r.body;
      throw ApiException(r.statusCode, '$msg');
    }
    return body;
  }

  // --- Farmers ---
  Future<Map<String, dynamic>> createFarmer(String name, String phone, String lang) =>
      _post('/v1/farmers', {'full_name': name, 'phone': phone, 'preferred_lang': lang})
          .then((v) => v as Map<String, dynamic>);

  Future<Map<String, dynamic>> verifyKyc(String farmerId) =>
      _post('/v1/farmers/$farmerId/verify-kyc', {}).then((v) => v as Map<String, dynamic>);

  Future<Map<String, dynamic>> sellerStatus(String farmerId) =>
      _get('/v1/farmers/$farmerId/seller-status').then((v) => v as Map<String, dynamic>);

  Future<Map<String, dynamic>> erpSummary(String farmerId, {int? year}) =>
      _get('/v1/farmers/$farmerId/erp-summary', year != null ? {'year': year} : null)
          .then((v) => v as Map<String, dynamic>);

  // --- Fields ---
  Future<List<dynamic>> fields(String farmerId) =>
      _get('/v1/farmers/$farmerId/fields').then((v) => v as List<dynamic>);

  Future<Map<String, dynamic>> createField({
    required String farmerId,
    required List<List<double>> ring, // [[lng,lat], ...] closed ring
    String ownership = 'owned',
    String? waterType,
  }) =>
      _post('/v1/fields', {
        'farmerId': farmerId,
        'ownership': ownership,
        'boundary': [ring],
        if (waterType != null) 'waterSource': {'type': waterType},
      }).then((v) => v as Map<String, dynamic>);

  Future<Map<String, dynamic>> passport(String fieldId) =>
      _get('/v1/fields/$fieldId/passport').then((v) => v as Map<String, dynamic>);

  Future<Map<String, dynamic>> scoreField(String fieldId) =>
      _post('/v1/fields/$fieldId/score', {}).then((v) => v as Map<String, dynamic>);

  Future<Map<String, dynamic>> cropReco(String fieldId, String season, {String risk = 'medium'}) =>
      _get('/v1/fields/$fieldId/crop-reco', {'season': season, 'risk_appetite': risk})
          .then((v) => v as Map<String, dynamic>);

  Future<Map<String, dynamic>> advisory(String fieldId, Map<String, num> weather) =>
      _post('/v1/fields/$fieldId/advisory', weather).then((v) => v as Map<String, dynamic>);

  Future<List<dynamic>> alerts(String fieldId) =>
      _get('/v1/fields/$fieldId/alerts').then((v) => v as List<dynamic>);
}

class ApiException implements Exception {
  ApiException(this.statusCode, this.message);
  final int statusCode;
  final String message;
  @override
  String toString() => 'API $statusCode: $message';
}
