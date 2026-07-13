import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

const _moods = ['happy', 'sad', 'energetic', 'chill', 'romantic', 'epic', 'mysterious'];
const _genres = ['pop', 'rock', 'hip-hop', 'r-and-b', 'electronic', 'folk', 'jazz', 'country'];
const _lengths = ['short', 'medium', 'long'];
const _vocals = ['female', 'male', 'duet', 'instrumental'];

void main() => runApp(const AriaApp());

class AriaApp extends StatelessWidget {
  const AriaApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
      title: 'Aria',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
          useMaterial3: true,
          colorSchemeSeed: const Color(0xff8b5cf6),
          brightness: Brightness.dark),
      home: const ProjectCreatorPage());
}

class ProjectCreatorPage extends StatefulWidget {
  const ProjectCreatorPage({super.key});

  @override
  State<ProjectCreatorPage> createState() => _ProjectCreatorPageState();
}

class _ProjectCreatorPageState extends State<ProjectCreatorPage> {
  final _ideaController = TextEditingController();
  final _api = AriaApi(const String.fromEnvironment('ARIA_API_URL',
      defaultValue: 'http://localhost:8010'));
  ProjectSummary? _project;
  PlatformFile? _inputFile;
  String? _error;
  bool _loading = false;
  String _inputMode = 'prompt';
  String _mood = 'happy', _genre = 'pop', _length = 'medium', _vocal = 'female';

  @override
  void dispose() {
    _ideaController.dispose();
    super.dispose();
  }

  Future<void> _pickInput() async {
    final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        withData: true,
        allowedExtensions: const [
          'mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wma',
          'mp4', 'mov', 'm4v', 'webm', 'mpeg', 'mpg', 'avi', 'mkv'
        ]);
    if (result != null && result.files.single.bytes != null && mounted) {
      setState(() => _inputFile = result.files.single);
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
      final project = await _api.createProject(
          idea: _ideaController.text.trim(),
          mood: _mood,
          genre: _genre,
          length: _length,
          vocal: _vocal,
          mediaPurpose: _inputMode == 'voice' ? 'voice' : 'mixture',
          media: _inputFile);
      if (mounted) setState(() => _project = project);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _refresh() async {
    final id = _project?.id;
    if (id == null) return;
    try {
      final project = await _api.getProject(id);
      if (mounted) setState(() => _project = project);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('Aria')),
      body: SafeArea(
          child: ListView(padding: const EdgeInsets.all(20), children: [
        Text('Multimodal song workspace',
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
                color: Theme.of(context).colorScheme.primary)),
        const SizedBox(height: 8),
        Text('Create an input project',
            style: Theme.of(context)
                .textTheme
                .headlineMedium
                ?.copyWith(fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Text('Upload and normalize source media before Phase 2 analysis.',
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
              DropdownMenuItem(value: 'prompt', child: Text('Text only')),
              DropdownMenuItem(value: 'voice', child: Text('Voice recording')),
              DropdownMenuItem(value: 'media', child: Text('Audio or video file'))
            ],
            onChanged: _loading
                ? null
                : (value) => setState(() {
                      _inputMode = value!;
                      if (value == 'prompt') _inputFile = null;
                    })),
        if (_inputMode != 'prompt') ...[
          const SizedBox(height: 8),
          OutlinedButton.icon(
              onPressed: _loading ? null : _pickInput,
              icon: const Icon(Icons.upload_file),
              label: Text(_inputFile?.name ?? 'Choose audio or video')),
          Text('The original is preserved and normalized into working WAV artifacts.',
              style: Theme.of(context).textTheme.bodySmall)
        ],
        const SizedBox(height: 12),
        Row(children: [
          _choice('Mood', _mood, _moods, (value) => setState(() => _mood = value!)),
          const SizedBox(width: 12),
          _choice('Genre', _genre, _genres, (value) => setState(() => _genre = value!))
        ]),
        const SizedBox(height: 12),
        Row(children: [
          _choice('Length', _length, _lengths, (value) => setState(() => _length = value!)),
          const SizedBox(width: 12),
          _choice('Vocals', _vocal, _vocals, (value) => setState(() => _vocal = value!))
        ]),
        const SizedBox(height: 16),
        FilledButton.icon(
            onPressed: _loading ||
                    (_ideaController.text.trim().length < 3 && _inputFile == null)
                ? null
                : _create,
            icon: const Icon(Icons.create_new_folder),
            label: Text(_loading ? 'Preparing input…' : 'Create project')),
        if (_error != null) ...[
          const SizedBox(height: 12),
          _Notice(text: _error!, error: true)
        ],
        if (_project != null) ...[
          const SizedBox(height: 24),
          _ProjectCard(project: _project!, onRefresh: _refresh)
        ]
      ])));

  Expanded _choice(String label, String value, List<String> values,
          ValueChanged<String?> onChanged) =>
      Expanded(
          child: DropdownButtonFormField<String>(
              initialValue: value,
              decoration: InputDecoration(
                  labelText: label, border: const OutlineInputBorder()),
              items: values
                  .map((item) => DropdownMenuItem(value: item, child: Text(item)))
                  .toList(),
              onChanged: _loading ? null : onChanged));
}

class AriaApi {
  AriaApi(this.baseUrl);
  final String baseUrl;
  Uri _uri(String path) => Uri.parse('$baseUrl$path');

  Future<ProjectSummary> createProject({
    required String idea,
    required String mood,
    required String genre,
    required String length,
    required String vocal,
    required String mediaPurpose,
    PlatformFile? media,
  }) async {
    final fields = {
      'idea': idea,
      'mood': mood,
      'genre': genre,
      'length': length,
      'vocal_style': vocal,
      'language': 'en'
    };
    if (media != null) {
      final request = http.MultipartRequest('POST', _uri('/songs'))
        ..fields.addAll(fields)
        ..fields['media_purpose'] = mediaPurpose
        ..files.add(http.MultipartFile.fromBytes('media', media.bytes!,
            filename: media.name));
      final response = await request.send();
      final body = await response.stream.bytesToString();
      if (response.statusCode >= 300) {
        throw Exception('Could not prepare input (${response.statusCode})');
      }
      return ProjectSummary.fromJson(
          (jsonDecode(body) as Map<String, dynamic>)['project'] as Map<String, dynamic>);
    }
    final response = await http.post(_uri('/songs'),
        headers: {'Content-Type': 'application/json'}, body: jsonEncode(fields));
    if (response.statusCode >= 300) {
      throw Exception('Could not create project (${response.statusCode})');
    }
    return ProjectSummary.fromJson(
        (jsonDecode(response.body) as Map<String, dynamic>)['project'] as Map<String, dynamic>);
  }

  Future<ProjectSummary> getProject(String id) async {
    final response = await http.get(_uri('/songs/$id'));
    if (response.statusCode >= 300) {
      throw Exception('Could not load project (${response.statusCode})');
    }
    return ProjectSummary.fromJson(
        (jsonDecode(response.body) as Map<String, dynamic>)['project'] as Map<String, dynamic>);
  }
}

class ProjectSummary {
  const ProjectSummary(
      {required this.id, required this.stage, this.status, this.artifactCount = 0});
  final String id;
  final String stage;
  final String? status;
  final int artifactCount;

  factory ProjectSummary.fromJson(Map<String, dynamic> json) => ProjectSummary(
      id: json['id'] as String,
      stage: json['stage'] as String? ?? 'draft',
      status: json['status'] as String?,
      artifactCount: (json['artifacts'] as List<dynamic>?)?.length ?? 0);
}

class _ProjectCard extends StatelessWidget {
  const _ProjectCard({required this.project, required this.onRefresh});
  final ProjectSummary project;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final ready = project.stage == 'input_ready';
    return Card(
        child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(ready ? 'Input ready for analysis' : 'Draft saved',
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              Text('Project ${project.id}'),
              Text('State: ${project.stage}'),
              if (project.artifactCount > 0)
                Text('${project.artifactCount} persisted artifacts'),
              const SizedBox(height: 8),
              Text(ready
                  ? 'Phase 2 will add acoustic analysis and input interpretation.'
                  : 'Attach media when you are ready to prepare an analysis input.'),
              TextButton.icon(
                  onPressed: onRefresh,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Refresh'))
            ])));
  }
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
