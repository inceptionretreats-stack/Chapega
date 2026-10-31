/// Typed reads from decoded JSON objects. A missing or wrongly typed field
/// throws [FormatException] naming the field, so a changed API shape fails
/// loudly in tests instead of silently showing wrong data.
typedef JsonMap = Map<String, Object?>;

extension JsonReading on JsonMap {
  Never _bad(String key, String expected) =>
      throw FormatException('Expected "$key" to be $expected, got ${this[key].runtimeType}.');

  String str(String key) {
    final value = this[key];
    return value is String ? value : _bad(key, 'a string');
  }

  String? optStr(String key) {
    final value = this[key];
    if (value == null) return null;
    return value is String ? value : _bad(key, 'a string');
  }

  int integer(String key) {
    final value = this[key];
    if (value is int) return value;
    if (value is double && value == value.roundToDouble()) return value.toInt();
    return _bad(key, 'an integer');
  }

  int? optInt(String key) => this[key] == null ? null : integer(key);

  bool boolean(String key) {
    final value = this[key];
    return value is bool ? value : _bad(key, 'true or false');
  }

  bool optBool(String key, {bool fallback = false}) => this[key] == null ? fallback : boolean(key);

  DateTime date(String key) {
    final parsed = DateTime.tryParse(str(key));
    return parsed ?? _bad(key, 'an ISO date');
  }

  JsonMap obj(String key) {
    final value = this[key];
    return value is Map<String, Object?> ? value : _bad(key, 'an object');
  }

  List<T> list<T>(String key, T Function(JsonMap item) read) {
    final value = this[key];
    if (value == null) return const [];
    if (value is! List<Object?>) _bad(key, 'a list');
    return [
      for (final item in value)
        if (item is Map<String, Object?>) read(item) else _bad(key, 'a list of objects'),
    ];
  }

  List<String> strings(String key) {
    final value = this[key];
    if (value == null) return const [];
    if (value is! List<Object?>) _bad(key, 'a list');
    return [for (final item in value) item is String ? item : _bad(key, 'a list of strings')];
  }
}
