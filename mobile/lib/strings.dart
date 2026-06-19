import 'package:flutter/widgets.dart';

/// Lightweight multilingual string table (en/hi/ta) — mirrors the docs' remote
/// string-catalog approach with a fallback chain (lang -> en -> key).
class S {
  S(this.lang);
  final String lang;

  static const supported = [Locale('en'), Locale('hi'), Locale('ta')];

  static const _t = <String, Map<String, String>>{
    'app_title': {'en': 'Kadir AI', 'hi': 'कदिर AI', 'ta': 'கதிர் AI'},
    'my_farm': {'en': 'My Farm', 'hi': 'मेरा खेत', 'ta': 'என் பண்ணை'},
    'fields': {'en': 'Fields', 'hi': 'खेत', 'ta': 'வயல்கள்'},
    'add_field': {'en': 'Add Field', 'hi': 'खेत जोड़ें', 'ta': 'வயல் சேர்'},
    'advisory': {'en': 'Advisory', 'hi': 'सलाह', 'ta': 'ஆலோசனை'},
    'crop_reco': {'en': 'Crop Advice', 'hi': 'फसल सलाह', 'ta': 'பயிர் ஆலோசனை'},
    'scores': {'en': 'Risk & Credit', 'hi': 'जोखिम और ऋण', 'ta': 'அபாயம் & கடன்'},
    'name': {'en': 'Name', 'hi': 'नाम', 'ta': 'பெயர்'},
    'phone': {'en': 'Phone', 'hi': 'फ़ोन', 'ta': 'தொலைபேசி'},
    'continue_': {'en': 'Continue', 'hi': 'आगे बढ़ें', 'ta': 'தொடரவும்'},
    'register': {'en': 'Register', 'hi': 'पंजीकरण', 'ta': 'பதிவு'},
    'at_risk': {'en': 'at risk', 'hi': 'जोखिम में', 'ta': 'அபாயத்தில்'},
    'no_fields': {'en': 'No fields yet. Add your first field.', 'hi': 'अभी कोई खेत नहीं। पहला खेत जोड़ें।', 'ta': 'வயல் இல்லை. முதல் வயலைச் சேர்க்கவும்.'},
    'area': {'en': 'Area', 'hi': 'क्षेत्रफल', 'ta': 'பரப்பு'},
    'credit_score': {'en': 'Credit Score', 'hi': 'ऋण स्कोर', 'ta': 'கடன் மதிப்பெண்'},
    'farm_risk': {'en': 'Farm Risk', 'hi': 'खेत जोखिम', 'ta': 'பண்ணை அபாயம்'},
    'check_weather': {'en': 'Check today\'s advisory', 'hi': 'आज की सलाह देखें', 'ta': 'இன்றைய ஆலோசனையைப் பார்'},
    'language': {'en': 'Language', 'hi': 'भाषा', 'ta': 'மொழி'},
  };

  String t(String key) => _t[key]?[lang] ?? _t[key]?['en'] ?? key;

  static S of(BuildContext context) => S(Localizations.localeOf(context).languageCode);
}
