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
  final _audienceController = TextEditingController();
  final _resumeController = TextEditingController();
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
    _audienceController.dispose();
    _resumeController.dispose();
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
          audience: _audienceController.text.trim(),
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

  Future<void> _resume() async {
    final id = _resumeController.text.trim();
    if (id.isEmpty) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final project = await _api.getProject(id);
      if (mounted) setState(() => _project = project);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
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
        TextField(
            controller: _audienceController,
            enabled: !_loading,
            decoration: const InputDecoration(
                labelText: 'Intended audience (optional)',
                hintText: 'Indie listeners, sync licensing...',
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
        const SizedBox(height: 16),
        Text('Resume an existing project',
            style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 8),
        TextField(
            controller: _resumeController,
            enabled: !_loading,
            decoration: const InputDecoration(
                labelText: 'Project ID',
                border: OutlineInputBorder())),
        const SizedBox(height: 8),
        OutlinedButton.icon(
            onPressed: _loading ? null : _resume,
            icon: const Icon(Icons.folder_open),
            label: const Text('Open project')),
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

  String _errorMessage(http.Response response, String fallback) {
    try {
      final decoded = jsonDecode(response.body) as Map<String, dynamic>;
      final error = decoded['error'] as Map<String, dynamic>?;
      if (error?['message'] is String) return error!['message'] as String;
    } catch (_) {}
    return fallback;
  }

  Future<ProjectSummary> createProject({
    required String idea,
    required String mood,
    required String genre,
    required String length,
    required String vocal,
    required String audience,
    required String mediaPurpose,
    PlatformFile? media,
  }) async {
    final fields = {
      'idea': idea,
      'mood': mood,
      'genre': genre,
      'length': length,
      'vocal_style': vocal,
      'language': 'en',
      if (audience.isNotEmpty) 'audience': audience,
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
        throw Exception(_parseErrorBody(body, 'Could not prepare input (${response.statusCode})'));
      }
      final decoded = jsonDecode(body) as Map<String, dynamic>;
      final input = decoded['input_asset'] as Map<String, dynamic>?;
      final manifest = input?['manifest'] as Map<String, dynamic>?;
      return ProjectSummary.fromJson(decoded['project'] as Map<String, dynamic>,
          inputId: manifest?['id'] as String? ?? decoded['project']['inputId'] as String?,
          interpretation: decoded['interpretation'] as Map<String, dynamic>?);
    }
    final response = await http.post(_uri('/projects'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(fields));
    if (response.statusCode >= 300) {
      throw Exception(_errorMessage(response, 'Could not create project (${response.statusCode})'));
    }
    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    return ProjectSummary.fromJson(decoded['project'] as Map<String, dynamic>);
  }

  String _parseErrorBody(String body, String fallback) {
    try {
      final decoded = jsonDecode(body) as Map<String, dynamic>;
      final error = decoded['error'] as Map<String, dynamic>?;
      if (error?['message'] is String) return error!['message'] as String;
    } catch (_) {}
    return fallback;
  }

  Future<ProjectSummary> getProject(String id) async {
    final response = await http.get(_uri('/projects/$id'));
    if (response.statusCode >= 300) {
      final legacy = await http.get(_uri('/songs/$id'));
      if (legacy.statusCode >= 300) {
        throw Exception(_errorMessage(response, 'Could not load project (${response.statusCode})'));
      }
      final project = (jsonDecode(legacy.body)
          as Map<String, dynamic>)['project'] as Map<String, dynamic>;
      return _withInterpretation(id, project);
    }
    final project = jsonDecode(response.body) as Map<String, dynamic>;
    return _withInterpretation(id, project);
  }

  Future<ProjectSummary> _withInterpretation(
      String id, Map<String, dynamic> project) async {
    final inputId = project['input_id'] as String? ?? project['inputId'] as String?;
    Map<String, dynamic>? interpretation;
    Map<String, dynamic>? evidenceSummary;
    if (inputId != null) {
      final interpretationResponse =
          await http.get(_uri('/projects/$id/inputs/$inputId/interpretation'));
      if (interpretationResponse.statusCode < 300) {
        final decoded = jsonDecode(interpretationResponse.body) as Map<String, dynamic>;
        interpretation = decoded['interpretation'] as Map<String, dynamic>?;
        evidenceSummary = decoded['evidenceSummary'] as Map<String, dynamic>?;
      }
    }
    return ProjectSummary.fromJson(project,
        inputId: inputId,
        interpretation: interpretation,
        evidenceSummary: evidenceSummary,
        artifactCount: (project['artifacts'] as List<dynamic>?)?.length ?? 0,
        understanding: await _loadUnderstanding(id));
  }

  Future<Map<String, dynamic>?> _loadUnderstanding(String projectId) async {
    final response = await http.get(_uri('/projects/$projectId/audio-understanding'));
    if (response.statusCode == 404) return null;
    if (response.statusCode >= 300) return null;
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> generateUnderstanding(String projectId, {String? inputId}) async {
    final response = await http.post(
      _uri('/projects/$projectId/audio-understanding'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({if (inputId != null) 'inputId': inputId}),
    );
    if (response.statusCode >= 300) {
      throw Exception(_errorMessage(response, 'Could not start musical understanding (${response.statusCode})'));
    }
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> getWorkflowRun(String projectId, String runId) async {
    final response = await http.get(_uri('/projects/$projectId/workflow-runs/$runId'));
    if (response.statusCode >= 300) {
      throw Exception(_errorMessage(response, 'Could not poll workflow run (${response.statusCode})'));
    }
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>?> waitForUnderstanding(String projectId, String runId) async {
    for (var attempt = 0; attempt < 60; attempt++) {
      final run = await getWorkflowRun(projectId, runId);
      final status = run['status'] as String?;
      if (status == 'succeeded' || status == 'partial' || status == 'failed') {
        if (status == 'failed') {
          final error = run['error'] as Map<String, dynamic>?;
          throw Exception(error?['message'] as String? ?? 'Musical understanding failed');
        }
        return _loadUnderstanding(projectId);
      }
      await Future<void>.delayed(const Duration(seconds: 2));
    }
    throw Exception('Musical understanding timed out');
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
      throw Exception(_errorMessage(response, 'Could not save correction (${response.statusCode})'));
    }
    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    final interpretation = decoded['interpretation'] as Map<String, dynamic>;
    return project.copyWith(
        interpretation: interpretation,
        evidenceSummary: decoded['evidenceSummary'] as Map<String, dynamic>?);
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
      this.suggestedUses = const [],
      this.topSourceProbability,
      this.evidenceWarningCount = 0,
      this.understandingTempoBpm,
      this.understandingKey,
      this.understandingSectionCount = 0,
      this.understandingStale = false,
      this.understandingTags = const []});
  final String id;
  final String stage;
  final String? status;
  final int artifactCount;
  final String? inputId, sourceType, reviewStatus;
  final int interpretationVersion;
  final List<String> intendedUses, warnings, suggestedUses;
  final double? topSourceProbability;
  final int evidenceWarningCount;
  final double? understandingTempoBpm;
  final String? understandingKey;
  final int understandingSectionCount;
  final bool understandingStale;
  final List<String> understandingTags;

  factory ProjectSummary.fromJson(Map<String, dynamic> json,
          {String? inputId,
          Map<String, dynamic>? interpretation,
          Map<String, dynamic>? evidenceSummary,
          int? artifactCount,
          Map<String, dynamic>? understanding}) =>
      ProjectSummary(
          id: json['id'] as String,
          stage: json['stage'] as String? ?? 'draft',
          status: json['status'] as String?,
          artifactCount: artifactCount ?? (json['artifacts'] as List<dynamic>?)?.length ?? 0,
          inputId: inputId ?? json['input_id'] as String? ?? json['inputId'] as String?,
          sourceType: interpretation?['sourceType'] as String?,
          reviewStatus: interpretation?['reviewStatus'] as String?,
          interpretationVersion: interpretation?['version'] as int? ?? json['interpretationVersion'] as int? ?? 0,
          intendedUses:
              (interpretation?['intendedUses'] as List<dynamic>? ?? [])
                  .cast<String>(),
          warnings: (interpretation?['warnings'] as List<dynamic>? ?? [])
              .cast<String>(),
          suggestedUses: ((interpretation?['suggestedUses'] as List<dynamic>? ??
                  [])
              .map((item) =>
                  (item as Map<String, dynamic>)['value'] as String)).toList(),
          topSourceProbability: (evidenceSummary?['topSourceProbability'] as num?)?.toDouble(),
          evidenceWarningCount: evidenceSummary?['warningCount'] as int? ?? 0,
          understandingTempoBpm: ((understanding?['global'] as Map<String, dynamic>?)?['tempo']
                  as Map<String, dynamic>?)?['bpm'] as num?)
              ?.toDouble(),
          understandingKey: _formatKey(understanding),
          understandingSectionCount: understanding?['sectionCount'] as int? ?? 0,
          understandingStale: understanding?['stale'] as bool? ?? false,
          understandingTags: ((understanding?['global'] as Map<String, dynamic>?)?['semanticTags']
                  as List<dynamic>? ??
              [])
              .cast<String>());

  static String? _formatKey(Map<String, dynamic>? understanding) {
    final key = (understanding?['global'] as Map<String, dynamic>?)?['key'] as Map<String, dynamic>?;
    if (key == null) return null;
    final root = key['root'] as String?;
    final mode = key['mode'] as String?;
    if (root == null || root == 'unknown') return null;
    return mode == null || mode == 'unknown' ? root : '$root $mode';
  }

  ProjectSummary copyWith(
      {required Map<String, dynamic> interpretation,
      Map<String, dynamic>? evidenceSummary,
      Map<String, dynamic>? understanding}) =>
      ProjectSummary.fromJson({
        'id': id,
        'stage': interpretation['reviewStatus'] == 'needs_review'
            ? 'awaiting_input_review'
            : 'input_interpreted',
        'status': status,
        'artifacts': List.filled(artifactCount, null)
      },
          inputId: inputId,
          interpretation: interpretation,
          evidenceSummary: evidenceSummary,
          artifactCount: artifactCount,
          understanding: understanding);
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
  bool _analyzing = false;

  bool get _interpretationApproved {
    final status = widget.project.reviewStatus;
    return status == 'auto_accepted' ||
        status == 'user_confirmed' ||
        status == 'user_corrected';
  }

  Future<void> _analyzeMusic() async {
    setState(() => _analyzing = true);
    try {
      final start = await widget.api.generateUnderstanding(
          widget.project.id,
          inputId: widget.project.inputId);
      Map<String, dynamic>? understanding;
      if (start['reused'] == true) {
        understanding = start['understanding'] as Map<String, dynamic>?;
      } else {
        final run = start['workflowRun'] as Map<String, dynamic>?;
        if (run?['id'] is String) {
          understanding = await widget.api.waitForUnderstanding(
              widget.project.id, run!['id'] as String);
        }
      }
      if (!mounted || understanding == null) return;
      widget.onChanged(ProjectSummary.fromJson(
        {'id': widget.project.id, 'stage': widget.project.stage, 'status': widget.project.status},
        inputId: widget.project.inputId,
        interpretation: {
          'sourceType': widget.project.sourceType,
          'reviewStatus': widget.project.reviewStatus,
          'version': widget.project.interpretationVersion,
          'intendedUses': widget.project.intendedUses,
          'warnings': widget.project.warnings,
          'suggestedUses':
              widget.project.suggestedUses.map((value) => {'value': value}).toList(),
        },
        artifactCount: widget.project.artifactCount,
        understanding: understanding,
      ));
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.toString())));
      }
    } finally {
      if (mounted) setState(() => _analyzing = false);
    }
  }

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
                if (project.topSourceProbability != null)
                  Text(
                      'Confidence: ${(project.topSourceProbability! * 100).toStringAsFixed(0)}%'),
                Text('Review: ${project.reviewStatus?.replaceAll('_', ' ')}'),
                if (project.evidenceWarningCount > 0)
                  Text('Evidence warnings: ${project.evidenceWarningCount}',
                      style: TextStyle(
                          color: Theme.of(context).colorScheme.tertiary)),
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
              if (_interpretationApproved) ...[
                const SizedBox(height: 8),
                FilledButton.icon(
                    onPressed: _analyzing ? null : _analyzeMusic,
                    icon: const Icon(Icons.graphic_eq),
                    label: Text(_analyzing ? 'Analyzing music…' : 'Analyze music')),
              ],
              if (project.understandingTempoBpm != null ||
                  project.understandingKey != null ||
                  project.understandingSectionCount > 0) ...[
                const SizedBox(height: 12),
                Text('Musical understanding',
                    style: Theme.of(context).textTheme.titleSmall),
                if (project.understandingStale)
                  Text('Stale — regenerate after interpretation changes',
                      style: TextStyle(
                          color: Theme.of(context).colorScheme.tertiary)),
                if (project.understandingTempoBpm != null)
                  Text('Tempo: ${project.understandingTempoBpm!.toStringAsFixed(0)} BPM'),
                if (project.understandingKey != null)
                  Text('Key: ${project.understandingKey}'),
                if (project.understandingSectionCount > 0)
                  Text('Sections: ${project.understandingSectionCount}'),
                if (project.understandingTags.isNotEmpty)
                  Text(
                      'Tags: ${project.understandingTags.map((tag) => tag.replaceAll('_', ' ')).join(', ')}'),
              ],
              const SizedBox(height: 8),
              Text(ready
                  ? 'Review the interpretation, then continue to musical understanding.'
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
