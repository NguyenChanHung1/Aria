import 'dart:async';
import 'dart:convert';

import 'package:audioplayers/audioplayers.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

const _moods = [
  'happy',
  'sad',
  'energetic',
  'chill',
  'romantic',
  'epic',
  'mysterious'
];
const _genres = [
  'pop',
  'rock',
  'hip-hop',
  'r-and-b',
  'electronic',
  'folk',
  'jazz',
  'country'
];
const _lengths = ['short', 'medium', 'long'];
const _vocals = ['female', 'male', 'duet', 'instrumental'];

void main() => runApp(const AriaApp());

class AriaApp extends StatelessWidget {
  const AriaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Aria',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
          useMaterial3: true,
          colorSchemeSeed: const Color(0xff8b5cf6),
          brightness: Brightness.dark),
      home: const SongCreatorPage(),
    );
  }
}

class SongCreatorPage extends StatefulWidget {
  const SongCreatorPage({super.key});

  @override
  State<SongCreatorPage> createState() => _SongCreatorPageState();
}

class _SongCreatorPageState extends State<SongCreatorPage> {
  final _ideaController = TextEditingController();
  final _api = AgentApi(const String.fromEnvironment('AGENT_API_URL',
      defaultValue: 'http://localhost:8010'));
  final _player = AudioPlayer();
  Timer? _pollTimer;
  SongProject? _project;
  String? _error;
  bool _loading = false;
  bool _settingsLoading = false;
  PlatformFile? _inputFile;
  String _inputMode = 'prompt';
  String _globalPrompt = '';
  String _mood = 'happy', _genre = 'pop', _length = 'medium', _vocal = 'female';

  @override
  void dispose() {
    _pollTimer?.cancel();
    _ideaController.dispose();
    _player.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    try {
      final prompt = await _api.getGlobalPrompt();
      if (mounted) setState(() => _globalPrompt = prompt);
    } catch (_) {
      // Settings are optional; song creation still works with an empty prompt.
    }
  }

  Future<void> _pickInput() async {
    final result = await FilePicker.platform
        .pickFiles(type: FileType.custom, withData: true, allowedExtensions: [
      'mp3',
      'wav',
      'm4a',
      'aac',
      'flac',
      'ogg',
      'opus',
      'mp4',
      'mov',
      'm4v',
      'webm',
      'mpeg',
      'mpg',
      'avi',
      'mkv'
    ]);
    if (result != null && result.files.single.bytes != null && mounted) {
      setState(() => _inputFile = result.files.single);
    }
  }

  Future<void> _editSettings() async {
    final controller = TextEditingController(text: _globalPrompt);
    final prompt = await showDialog<String>(
        context: context,
        builder: (context) => AlertDialog(
                title: const Text('Global producer prompt'),
                content: TextField(
                    controller: controller,
                    minLines: 4,
                    maxLines: 8,
                    decoration: const InputDecoration(
                        hintText:
                            'You are a songwriter who loves pop and rap...',
                        border: OutlineInputBorder())),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Cancel')),
                  FilledButton(
                      onPressed: () => Navigator.pop(context, controller.text),
                      child: const Text('Save'))
                ]));
    controller.dispose();
    if (prompt == null) return;
    setState(() => _settingsLoading = true);
    try {
      _globalPrompt = await _api.setGlobalPrompt(prompt);
      if (mounted) setState(() {});
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _settingsLoading = false);
    }
  }

  Future<void> _create() async {
    if (_ideaController.text.trim().length < 3 && _inputFile == null) return;
    setState(() {
      _loading = true;
      _error = null;
      _project = null;
    });
    try {
      final id = await _api.createSong(_ideaController.text.trim(), _mood,
          _genre, _length, _vocal, _inputFile);
      await _refresh(id);
      _pollTimer?.cancel();
      _pollTimer =
          Timer.periodic(const Duration(seconds: 2), (_) => _refresh(id));
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _refresh(String id) async {
    try {
      final project = await _api.getProject(id);
      if (!mounted) {
        return;
      }
      setState(() {
        _project = project;
        _loading = false;
      });
      if (project.stage == 'complete' || project.stage == 'failed') {
        _pollTimer?.cancel();
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final project = _project;
    return Scaffold(
      appBar: AppBar(title: const Text('Aria'), centerTitle: false, actions: [
        IconButton(
            onPressed: _settingsLoading ? null : _editSettings,
            icon: const Icon(Icons.tune),
            tooltip: 'Settings')
      ]),
      body: SafeArea(
          child: ListView(padding: const EdgeInsets.all(20), children: [
        Text('AI song studio for everyone',
            style: Theme.of(context)
                .textTheme
                .labelLarge
                ?.copyWith(color: Theme.of(context).colorScheme.primary)),
        const SizedBox(height: 8),
        Text('Describe your song',
            style: Theme.of(context)
                .textTheme
                .headlineMedium
                ?.copyWith(fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Text(
            'Aria handles planning, lyrics, composition, and mixing — no music theory required.',
            style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(height: 24),
        TextField(
            controller: _ideaController,
            minLines: 4,
            maxLines: 6,
            enabled: !_loading,
            decoration: const InputDecoration(
                labelText: "What's your song about?",
                hintText: 'A summer road trip with friends...',
                border: OutlineInputBorder())),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
            initialValue: _inputMode,
            decoration: const InputDecoration(
                labelText: 'Input source', border: OutlineInputBorder()),
            items: const [
              DropdownMenuItem(value: 'prompt', child: Text('Raw prompt')),
              DropdownMenuItem(
                  value: 'voice', child: Text('Voice recording / audio')),
              DropdownMenuItem(
                  value: 'video', child: Text('Inspiring music video')),
              DropdownMenuItem(value: 'file', child: Text('MP3 or WAV file'))
            ],
            onChanged: _loading
                ? null
                : (value) {
                    setState(() {
                      _inputMode = value!;
                      if (value == 'prompt') _inputFile = null;
                    });
                  }),
        if (_inputMode != 'prompt') ...[
          const SizedBox(height: 8),
          OutlinedButton.icon(
              onPressed: _loading ? null : _pickInput,
              icon: const Icon(Icons.upload_file),
              label: Text(_inputFile == null
                  ? 'Choose ${_inputMode == 'video' ? 'a video' : 'an audio file'}'
                  : _inputFile!.name)),
          const SizedBox(height: 4),
          Text(
              'Video audio is extracted and normalized to WAV PCM 16-bit, 44.1 kHz mono.',
              style: Theme.of(context).textTheme.bodySmall)
        ],
        const SizedBox(height: 12),
        Row(children: [
          _choice('Mood', _mood, _moods, (v) => setState(() => _mood = v!)),
          const SizedBox(width: 12),
          _choice('Genre', _genre, _genres, (v) => setState(() => _genre = v!))
        ]),
        const SizedBox(height: 12),
        Row(children: [
          _choice(
              'Length', _length, _lengths, (v) => setState(() => _length = v!)),
          const SizedBox(width: 12),
          _choice('Vocals', _vocal, _vocals, (v) => setState(() => _vocal = v!))
        ]),
        const SizedBox(height: 16),
        FilledButton.icon(
            onPressed: _loading ||
                    (_ideaController.text.trim().length < 3 &&
                        _inputFile == null)
                ? null
                : _create,
            icon: const Icon(Icons.auto_awesome),
            label: Text(_loading ? 'Creating your song…' : 'Create my song')),
        if (_error != null) ...[
          const SizedBox(height: 12),
          _Notice(text: _error!, error: true)
        ],
        if (project != null) ...[
          const SizedBox(height: 24),
          _Progress(stage: project.stage),
          if (project.lyrics != null) _Lyrics(project: project),
          if (project.composition != null)
            _Preview(api: _api, project: project, player: _player),
          if (project.stage == 'complete')
            _Result(api: _api, project: project, player: _player)
        ],
      ])),
    );
  }

  Expanded _choice(String label, String value, List<String> values,
          ValueChanged<String?> onChanged) =>
      Expanded(
          child: DropdownButtonFormField<String>(
              initialValue: value,
              decoration: InputDecoration(
                  labelText: label, border: const OutlineInputBorder()),
              items: values
                  .map((v) => DropdownMenuItem(value: v, child: Text(v)))
                  .toList(),
              onChanged: _loading ? null : onChanged));
}

class AgentApi {
  AgentApi(this.baseUrl);
  final String baseUrl;
  Uri _uri(String path) => Uri.parse('$baseUrl$path');

  Future<String> createSong(String idea, String mood, String genre,
      String length, String vocal, PlatformFile? media) async {
    if (media != null) {
      final request = http.MultipartRequest('POST', _uri('/songs'))
        ..fields.addAll({
          'idea': idea,
          'mood': mood,
          'genre': genre,
          'length': length,
          'vocal_style': vocal,
          'language': 'en'
        })
        ..files.add(http.MultipartFile.fromBytes('media', media.bytes!,
            filename: media.name));
      final response = await request.send();
      final body = await response.stream.bytesToString();
      if (response.statusCode >= 300) {
        throw Exception('Could not upload input (${response.statusCode})');
      }
      return (jsonDecode(body) as Map<String, dynamic>)['project_id'] as String;
    }
    final response = await http.post(_uri('/songs'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'idea': idea,
          'mood': mood,
          'genre': genre,
          'length': length,
          'vocal_style': vocal,
          'language': 'en'
        }));
    if (response.statusCode >= 300) {
      throw Exception('Could not start song creation (${response.statusCode})');
    }
    return (jsonDecode(response.body) as Map<String, dynamic>)['project_id']
        as String;
  }

  Future<String> getGlobalPrompt() async {
    final response = await http.get(_uri('/settings/prompt'));
    if (response.statusCode >= 300) throw Exception('Could not load settings');
    return (jsonDecode(response.body) as Map<String, dynamic>)['global_prompt']
            as String? ??
        '';
  }

  Future<String> setGlobalPrompt(String prompt) async {
    final response = await http.put(_uri('/settings/prompt'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'global_prompt': prompt}));
    if (response.statusCode >= 300) throw Exception('Could not save settings');
    return (jsonDecode(response.body) as Map<String, dynamic>)['global_prompt']
            as String? ??
        '';
  }

  Future<SongProject> getProject(String id) async {
    final response = await http.get(_uri('/songs/$id'));
    if (response.statusCode >= 300) {
      throw Exception('Could not load project (${response.statusCode})');
    }
    return SongProject.fromJson((jsonDecode(response.body)
        as Map<String, dynamic>)['project'] as Map<String, dynamic>);
  }

  String asset(String id, String name) =>
      _uri('/songs/$id/assets/$name').toString();
}

class SongProject {
  SongProject(
      {required this.id,
      required this.stage,
      this.plan,
      this.lyrics,
      this.composition,
      this.mix,
      this.error});
  final String id, stage;
  final Map<String, dynamic>? plan, lyrics, composition, mix;
  final String? error;
  factory SongProject.fromJson(Map<String, dynamic> j) => SongProject(
      id: j['id'],
      stage: j['stage'],
      plan: j['plan'],
      lyrics: j['lyrics'],
      composition: j['composition'],
      mix: j['mix'],
      error: j['error']);
}

class _Progress extends StatelessWidget {
  const _Progress({required this.stage});
  final String stage;
  static const stages = [
    'planning',
    'lyrics',
    'composition',
    'mixing',
    'complete'
  ];
  @override
  Widget build(BuildContext context) => Card(
      child: Padding(
          padding: const EdgeInsets.all(16),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Progress', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            for (final s in stages)
              ListTile(
                  dense: true,
                  leading: Icon(
                      s == stage
                          ? Icons.radio_button_checked
                          : stages.indexOf(s) < stages.indexOf(stage)
                              ? Icons.check_circle
                              : Icons.radio_button_unchecked,
                      color: stages.indexOf(s) <= stages.indexOf(stage)
                          ? Theme.of(context).colorScheme.primary
                          : null),
                  title: Text(s[0].toUpperCase() + s.substring(1)))
          ])));
}

class _Lyrics extends StatelessWidget {
  const _Lyrics({required this.project});
  final SongProject project;
  @override
  Widget build(BuildContext context) => Card(
          child: ExpansionTile(
              title: const Text('Lyrics'),
              initiallyExpanded: true,
              children: [
            Padding(
                padding: const EdgeInsets.all(16),
                child: SelectableText(
                    project.lyrics!['full_text'] as String? ?? ''))
          ]));
}

class _Preview extends StatelessWidget {
  const _Preview(
      {required this.api, required this.project, required this.player});
  final AgentApi api;
  final SongProject project;
  final AudioPlayer player;
  @override
  Widget build(BuildContext context) => Card(
      child: Padding(
          padding: const EdgeInsets.all(16),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Instrumental preview',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            FilledButton.tonalIcon(
                onPressed: () => player
                    .play(UrlSource(api.asset(project.id, 'instrumental'))),
                icon: const Icon(Icons.play_arrow),
                label: const Text('Listen')),
            TextButton.icon(
                onPressed: () {},
                icon: const Icon(Icons.download),
                label: const Text('MIDI available from the web client'))
          ])));
}

class _Result extends StatelessWidget {
  const _Result(
      {required this.api, required this.project, required this.player});
  final AgentApi api;
  final SongProject project;
  final AudioPlayer player;
  @override
  Widget build(BuildContext context) => Card(
      child: Padding(
          padding: const EdgeInsets.all(16),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(project.plan?['title'] as String? ?? 'Your song',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            if (project.mix != null)
              FilledButton.icon(
                  onPressed: () =>
                      player.play(UrlSource(api.asset(project.id, 'mix'))),
                  icon: const Icon(Icons.play_circle),
                  label: const Text('Play final mix')),
            if (project.plan != null)
              Text('${project.plan!['bpm']} BPM · ${project.plan!['key']}')
          ])));
}

class _Notice extends StatelessWidget {
  const _Notice({required this.text, this.error = false});
  final String text;
  final bool error;
  @override
  Widget build(BuildContext context) => Card(
      color: error ? Theme.of(context).colorScheme.errorContainer : null,
      child: Padding(padding: const EdgeInsets.all(12), child: Text(text)));
}
