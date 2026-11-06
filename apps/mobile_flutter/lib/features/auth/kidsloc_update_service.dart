import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:package_info_plus/package_info_plus.dart';

class KidsLocRelease {
  const KidsLocRelease({
    required this.version,
    required this.name,
    required this.notes,
    required this.apkUrl,
  });

  final String version;
  final String name;
  final String notes;
  final Uri apkUrl;

  factory KidsLocRelease.fromJson(Map<String, dynamic> json) {
    final assets = (json['assets'] as List<dynamic>? ?? const []);
    final apk = assets.cast<Map<String, dynamic>>().where((asset) {
      final name = (asset['name'] ?? '').toString().toLowerCase();
      return name.endsWith('.apk') && asset['browser_download_url'] is String;
    }).firstOrNull;
    if (apk == null) throw const FormatException('Esta versão não possui APK.');
    final tag = (json['tag_name'] ?? '').toString();
    return KidsLocRelease(
      version: tag.startsWith('v') ? tag.substring(1) : tag,
      name: (json['name'] ?? 'KidsLoc App').toString(),
      notes: (json['body'] ?? '').toString(),
      apkUrl: Uri.parse(apk['browser_download_url'] as String),
    );
  }
}

class KidsLocUpdateService {
  static const _latestRelease = 'https://api.github.com/repos/vbf1/kidsloc-app/releases/latest';

  Future<KidsLocRelease?> checkForUpdate() async {
    final response = await http.get(
      Uri.parse(_latestRelease),
      headers: const {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    ).timeout(const Duration(seconds: 20));
    if (response.statusCode == 404) return null;
    if (response.statusCode != 200) {
      throw HttpException('Não foi possível consultar as atualizações (HTTP ${response.statusCode}).');
    }
    final json = jsonDecode(utf8.decode(response.bodyBytes));
    if (json is! Map<String, dynamic> || json['draft'] == true || json['prerelease'] == true) return null;
    final release = KidsLocRelease.fromJson(json);
    final installed = (await PackageInfo.fromPlatform()).version;
    return _isNewer(release.version, installed) ? release : null;
  }

  bool _isNewer(String remote, String local) {
    List<int> parts(String value) => value
        .split('+').first.split('-').first.split('.')
        .map((part) => int.tryParse(part) ?? 0).toList();
    final a = parts(remote);
    final b = parts(local);
    for (var i = 0; i < (a.length > b.length ? a.length : b.length); i++) {
      final left = i < a.length ? a[i] : 0;
      final right = i < b.length ? b[i] : 0;
      if (left != right) return left > right;
    }
    return false;
  }

  Future<File> downloadApk(
    KidsLocRelease release, {
    required void Function(double progress) onProgress,
  }) async {
    final directory = await getTemporaryDirectory();
    final updateDirectory = Directory('${directory.path}/updates');
    if (!await updateDirectory.exists()) await updateDirectory.create(recursive: true);
    final file = File('${updateDirectory.path}/kidsloc-${release.version}.apk');
    final request = http.Request('GET', release.apkUrl);
    final client = http.Client();
    try {
      final response = await client.send(request).timeout(const Duration(seconds: 30));
      if (response.statusCode != 200) {
        throw HttpException('Falha ao baixar o APK (HTTP ${response.statusCode}).');
      }
      final total = response.contentLength ?? 0;
      var received = 0;
      final sink = file.openWrite();
      try {
        await for (final chunk in response.stream) {
          sink.add(chunk);
          received += chunk.length;
          if (total > 0) onProgress((received / total).clamp(0.0, 1.0));
        }
        await sink.flush();
      } finally {
        await sink.close();
      }
      if (!await file.exists() || await file.length() < 1024 * 1024) {
        throw const FormatException('O arquivo baixado parece incompleto.');
      }
      onProgress(1);
      return file;
    } catch (_) {
      if (await file.exists()) await file.delete();
      rethrow;
    } finally {
      client.close();
    }
  }
}
