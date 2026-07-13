import 'dart:convert';

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
          'mp3',
          'wav',
          'm4a',
          'aac',
          'flac',
          'ogg',
          'opus',
          'wma',
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
            style: Theme.of(context)
                .textTheme
                .labelLarge
                ?.copyWith(color: Theme.of(context).colorScheme.primary)),
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
              DropdownMenuItem(
                  value: 'media', child: Text('Audio or video file'))
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
          Text(
              'The original is preserved and normalized into working WAV artifacts.',
              style: Theme.of(context).textTheme.bodySmall)
        ],
        const SizedBox(height: 12),
        Row(children: [
          _choice(
              'Mood', _mood, _moods, (value) => setState(() => _mood = value!)),
          const SizedBox(width: 12),
          _choice('Genre', _genre, _genres,
              (value) => setState(() => _genre = value!))
        ]),
        const SizedBox(height: 12),
        Row(children: [
          _choice('Length', _length, _lengths,
              (value) => setState(() => _length = value!)),
          const SizedBox(width: 12),
          _choice('Vocals', _vocal, _vocals,
              (value) => setState(() => _vocal = value!))
        ]),
        const SizedBox(height: 16),
        FilledButton.icon(
            onPressed: _loading ||
                    (_ideaController.text.trim().length < 3 &&
                        _inputFile == null)
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
          _ProjectCard(
              project: _project!,
              api: _api,
              onChanged: (project) => setState(() => _project = project),
              onRefresh: _refresh)
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
                  .map((item) =>
                      DropdownMenuItem(value: item, child: Text(item)))
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
      final decoded = jsonDecode(body) as Map<String, dynamic>;
      final input = decoded['input_asset'] as Map<String, dynamic>?;
      final manifest = input?['manifest'] as Map<String, dynamic>?;
      return ProjectSummary.fromJson(decoded['project'] as Map<String, dynamic>,
          inputId: manifest?['id'] as String?,
          interpretation: decoded['interpretation'] as Map<String, dynamic>?);
    }
    final response = await http.post(_uri('/songs'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(fields));
    if (response.statusCode >= 300) {
      throw Exception('Could not create project (${response.statusCode})');
    }
    return ProjectSummary.fromJson((jsonDecode(response.body)
        as Map<String, dynamic>)['project'] as Map<String, dynamic>);
  }

  Future<ProjectSummary> getProject(String id) async {
    final response = await http.get(_uri('/songs/$id'));
    if (response.statusCode >= 300) {
      throw Exception('Could not load project (${response.statusCode})');
    }
    final project = (jsonDecode(response.body)
        as Map<String, dynamic>)['project'] as Map<String, dynamic>;
    final inputId = project['input_id'] as String?;
    Map<String, dynamic>? interpretation;
    if (inputId != null) {
      final interpretationResponse =
          await http.get(_uri('/projects/$id/inputs/$inputId/interpretation'));
      if (interpretationResponse.statusCode < 300) {
        interpretation = (jsonDecode(interpretationResponse.body)
            as Map<String, dynamic>)['interpretation'] as Map<String, dynamic>?;
      }
    }
    return ProjectSummary.fromJson(project,
        inputId: inputId, interpretation: interpretation);
  }

  Future<ProjectSummary> correctInterpretation(ProjectSummary project,
      String sourceType, List<String> intendedUses) async {
    final response = await http.patch(
        _uri(
            '/projects/${project.id}/inputs/${project.inputId}/interpretation'),
        headers: {
          'Content-Type': 'application/json',
          'x-editor-id': 'flutter-local-user'
        },
        body: jsonEncode({
          'baseVersion': project.interpretationVersion,
          'sourceType': sourceType,
          'intendedUses': intendedUses
        }));
    if (response.statusCode == 409) {
      throw Exception(
          'The interpretation changed. Refresh and compare your selection.');
    }
    if (response.statusCode >= 300) {
      throw Exception('Could not save correction (${response.statusCode})');
    }
    final interpretation = (jsonDecode(response.body)
        as Map<String, dynamic>)['interpretation'] as Map<String, dynamic>;
    return project.copyWith(interpretation: interpretation);
  }
}

class ProjectSummary {
  const ProjectSummary(
      {required this.id,
      required this.stage,
      this.status,
      this.artifactCount = 0,
      this.inputId,
      this.sourceType,
      this.reviewStatus,
      this.interpretationVersion = 0,
      this.intendedUses = const [],
      this.warnings = const [],
      this.suggestedUses = const []});
  final String id;
  final String stage;
  final String? status;
  final int artifactCount;
  final String? inputId, sourceType, reviewStatus;
  final int interpretationVersion;
  final List<String> intendedUses, warnings, suggestedUses;

  factory ProjectSummary.fromJson(Map<String, dynamic> json,
          {String? inputId, Map<String, dynamic>? interpretation}) =>
      ProjectSummary(
          id: json['id'] as String,
          stage: json['stage'] as String? ?? 'draft',
          status: json['status'] as String?,
          artifactCount: (json['artifacts'] as List<dynamic>?)?.length ?? 0,
          inputId: inputId ?? json['input_id'] as String?,
          sourceType: interpretation?['sourceType'] as String?,
          reviewStatus: interpretation?['reviewStatus'] as String?,
          interpretationVersion: interpretation?['version'] as int? ?? 0,
          intendedUses:
              (interpretation?['intendedUses'] as List<dynamic>? ?? [])
                  .cast<String>(),
          warnings: (interpretation?['warnings'] as List<dynamic>? ?? [])
              .cast<String>(),
          suggestedUses: ((interpretation?['suggestedUses'] as List<dynamic>? ??
                  [])
              .map((item) =>
                  (item as Map<String, dynamic>)['value'] as String)).toList());

  ProjectSummary copyWith({required Map<String, dynamic> interpretation}) =>
      ProjectSummary.fromJson({
        'id': id,
        'stage': interpretation['reviewStatus'] == 'needs_review'
            ? 'awaiting_input_review'
            : 'input_interpreted',
        'status': status,
        'artifacts': List.filled(artifactCount, null)
      }, inputId: inputId, interpretation: interpretation);
}

class _ProjectCard extends StatefulWidget {
  const _ProjectCard(
      {required this.project,
      required this.api,
      required this.onChanged,
      required this.onRefresh});
  final ProjectSummary project;
  final AriaApi api;
  final ValueChanged<ProjectSummary> onChanged;
  final VoidCallback onRefresh;

  @override
  State<_ProjectCard> createState() => _ProjectCardState();
}

class _ProjectCardState extends State<_ProjectCard> {
  bool _saving = false;

  Future<void> _review() async {
    var source = widget.project.sourceType ?? 'unknown';
    final uses = widget.project.intendedUses.toSet();
    final accepted = await showDialog<bool>(
        context: context,
        builder: (context) => StatefulBuilder(
            builder: (context, setDialogState) => AlertDialog(
                  title: const Text('Confirm input interpretation'),
                  content: SizedBox(
                      width: 420,
                      child: SingleChildScrollView(
                          child:
                              Column(mainAxisSize: MainAxisSize.min, children: [
                        DropdownButtonFormField<String>(
                            initialValue: source,
                            decoration:
                                const InputDecoration(labelText: 'Source type'),
                            items: const [
                              'speech',
                              'singing',
                              'humming',
                              'solo_instrument',
                              'mixed_music',
                              'environmental_sound',
                              'beatboxing',
                              'unknown'
                            ]
                                .map((value) => DropdownMenuItem(
                                    value: value,
                                    child: Text(value.replaceAll('_', ' '))))
                                .toList(),
                            onChanged: (value) =>
                                setDialogState(() => source = value!)),
                        const SizedBox(height: 12),
                        ...const [
                          'transcribe_lyrics',
                          'extract_melody',
                          'use_as_vocal_performance',
                          'use_as_instrument_performance',
                          'use_as_style_reference',
                          'continue_recording',
                          'ignore'
                        ].map((value) => CheckboxListTile(
                            value: uses.contains(value),
                            title: Text(value.replaceAll('_', ' ')),
                            onChanged: (checked) => setDialogState(() =>
                                checked!
                                    ? uses.add(value)
                                    : uses.remove(value))))
                      ]))),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(context, false),
                        child: const Text('Cancel')),
                    FilledButton(
                        onPressed: () => Navigator.pop(context, true),
                        child: const Text('Save'))
                  ],
                )));
    if (accepted != true || !mounted) return;
    setState(() => _saving = true);
    try {
      widget.onChanged(await widget.api
          .correctInterpretation(widget.project, source, uses.toList()));
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.toString())));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final project = widget.project;
    final ready = ['input_ready', 'input_interpreted', 'awaiting_input_review']
        .contains(project.stage);
    return Card(
        child: Padding(
            padding: const EdgeInsets.all(16),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(ready ? 'Input ready for analysis' : 'Draft saved',
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              Text('Project ${project.id}'),
              Text('State: ${project.stage}'),
              if (project.artifactCount > 0)
                Text('${project.artifactCount} persisted artifacts'),
              if (project.sourceType != null) ...[
                const SizedBox(height: 8),
                Text(
                    'Aria detected: ${project.sourceType!.replaceAll('_', ' ')}'),
                Text('Review: ${project.reviewStatus?.replaceAll('_', ' ')}'),
                if (project.suggestedUses.isNotEmpty)
                  Text(
                      'Suggested uses: ${project.suggestedUses.map((item) => item.replaceAll('_', ' ')).join(', ')}'),
                if (project.warnings.isNotEmpty)
                  Text('Check: ${project.warnings.join(', ')}',
                      style: TextStyle(
                          color: Theme.of(context).colorScheme.tertiary)),
                const SizedBox(height: 8),
                FilledButton.tonalIcon(
                    onPressed: _saving ? null : _review,
                    icon: const Icon(Icons.tune),
                    label: Text(_saving
                        ? 'Saving…'
                        : project.reviewStatus == 'needs_review'
                            ? 'Review input'
                            : 'Edit interpretation')),
              ],
              const SizedBox(height: 8),
              Text(ready
                  ? 'Phase 2 will add acoustic analysis and input interpretation.'
                  : 'Attach media when you are ready to prepare an analysis input.'),
              TextButton.icon(
                  onPressed: widget.onRefresh,
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
