import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IdeationService } from '@/services/ideation-service.js';
import type { EventEmitter } from '@/lib/events.js';
import type { SettingsService } from '@/services/settings-service.js';
import type { FeatureLoader } from '@/services/feature-loader.js';
import * as secureFs from '@/lib/secure-fs.js';
import * as platform from '@automaker/platform';
import * as utils from '@automaker/utils';
import type {
  CreateIdeaInput,
  UpdateIdeaInput,
  Idea,
  IdeationSession,
  StartSessionOptions,
} from '@automaker/types';
import { ProviderFactory } from '@/providers/provider-factory.js';

// Create a shared mock logger instance for assertions using vi.hoisted
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

// Mock dependencies
vi.mock('@/lib/secure-fs.js');
vi.mock('@automaker/platform');
vi.mock('@automaker/utils', async () => {
  const actual = await vi.importActual<typeof import('@automaker/utils')>('@automaker/utils');
  return {
    ...actual,
    createLogger: vi.fn(() => mockLogger),
    loadContextFiles: vi.fn(),
    isAbortError: vi.fn(),
  };
});
vi.mock('@/providers/provider-factory.js');
vi.mock('@/lib/sdk-options.js', () => ({
  createChatOptions: vi.fn(() => ({
    model: 'claude-sonnet-4-20250514',
    systemPrompt: 'test prompt',
  })),
  validateWorkingDirectory: vi.fn(),
}));

describe('IdeationService', () => {
  let service: IdeationService;
  let mockEvents: EventEmitter;
  let mockSettingsService: SettingsService;
  let mockFeatureLoader: FeatureLoader;
  const testProjectPath = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock event emitter
    mockEvents = {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      removeAllListeners: vi.fn(),
    } as unknown as EventEmitter;

    // Create mock settings service
    mockSettingsService = {
      getCredentials: vi.fn().mockResolvedValue({}),
      getGlobalSettings: vi.fn().mockResolvedValue({}),
    } as unknown as SettingsService;

    // Create mock feature loader
    mockFeatureLoader = {
      getAll: vi.fn().mockResolvedValue([]),
    } as unknown as FeatureLoader;

    // Mock platform functions
    vi.mocked(platform.ensureIdeationDir).mockResolvedValue(undefined);
    vi.mocked(platform.getIdeaDir).mockReturnValue(
      '/test/project/.automaker/ideation/ideas/idea-123'
    );
    vi.mocked(platform.getIdeaPath).mockReturnValue(
      '/test/project/.automaker/ideation/ideas/idea-123/idea.json'
    );
    vi.mocked(platform.getIdeasDir).mockReturnValue('/test/project/.automaker/ideation/ideas');
    vi.mocked(platform.getIdeationSessionPath).mockReturnValue(
      '/test/project/.automaker/ideation/sessions/session-123.json'
    );
    vi.mocked(platform.getIdeationSessionsDir).mockReturnValue(
      '/test/project/.automaker/ideation/sessions'
    );
    vi.mocked(platform.getIdeationAnalysisPath).mockReturnValue(
      '/test/project/.automaker/ideation/analysis.json'
    );

    // Mock utils (already mocked above, but reset return values)
    vi.mocked(utils.loadContextFiles).mockResolvedValue({
      formattedPrompt: 'Test context',
      files: [],
    });
    vi.mocked(utils.isAbortError).mockReturnValue(false);

    service = new IdeationService(mockEvents, mockSettingsService, mockFeatureLoader);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Session Management Tests
  // ============================================================================

  describe('Session Management', () => {
    describe('startSession', () => {
      it('should create a new session with default options', async () => {
        vi.mocked(secureFs.writeFile).mockResolvedValue(undefined);

        const session = await service.startSession(testProjectPath);

        expect(session).toBeDefined();
        expect(session.id).toMatch(/^session-/);
        expect(session.projectPath).toBe(testProjectPath);
        expect(session.status).toBe('active');
        expect(session.createdAt).toBeDefined();
        expect(session.updatedAt).toBeDefined();
        expect(platform.ensureIdeationDir).toHaveBeenCalledWith(testProjectPath);
        expect(secureFs.writeFile).toHaveBeenCalled();
        expect(mockEvents.emit).toHaveBeenCalledWith('ideation:session-started', {
          sessionId: session.id,
          projectPath: testProjectPath,
        });
      });

      it('should create session with custom options', async () => {
        vi.mocked(secureFs.writeFile).mockResolvedValue(undefined);

        const options: StartSessionOptions = {
          promptCategory: 'features',
          promptId: 'new-features',
        };

        const session = await service.startSession(testProjectPath, options);

        expect(session.promptCategory).toBe('features');
        expect(session.promptId).toBe('new-features');
      });

      it('should send initial message if provided in options', async () => {
        vi.mocked(secureFs.writeFile).mockResolvedValue(undefined);
        vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify({ features: [] }));

        // Mock provider
        const mockProvider = {
          executeQuery: vi.fn().mockReturnValue({
            async *[Symbol.asyncIterator]() {
              yield {
                type: 'result',
                subtype: 'success',
                result: 'AI response',
              };
            },
          }),
        };
        vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue(mockProvider as any);

        const options: StartSessionOptions = {
          initialMessage: 'Hello, AI!',
        };

        await service.startSession(testProjectPath, options);

        // Give time for the async message to process
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(mockProvider.executeQuery).toHaveBeenCalled();
      });
    });

    describe('getSession', () => {
      it('should return null for non-existent session', async () => {
        vi.mocked(secureFs.readFile).mockRejectedValue(new Error('ENOENT'));

        const result = await service.getSession(testProjectPath, 'non-existent');

        expect(result).toBeNull();
      });

      it('should return active session from memory', async () => {
        vi.mocked(secureFs.writeFile).mockResolvedValue(undefined);

        const session = await service.startSession(testProjectPath);
        const retrieved = await service.getSession(testProjectPath, session.id);

        expect(retrieved).toBeDefined();
        expect(retrieved?.id).toBe(session.id);
        expect(retrieved?.messages).toEqual([]);
      });

      it('should load session from disk if not in memory', async () => {
        const mockSession: IdeationSession = {
          id: 'session-123',
          projectPath: testProjectPath,
          status: 'active',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        const sessionData = {
          session: mockSession,
          messages: [],
        };

        vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(sessionData));

        const result = await service.getSession(testProjectPath, 'session-123');

        expect(result).toBeDefined();
        expect(result?.id).toBe('session-123');
      });
    });

    describe('stopSession', () => {
      it('should stop an active session', async () => {
        vi.mocked(secureFs.writeFile).mockResolvedValue(undefined);

        const session = await service.startSession(testProjectPath);
        await service.stopSession(session.id);

        expect(mockEvents.emit).toHaveBeenCalledWith('ideation:session-ended', {
          sessionId: session.id,
        });
      });

      it('should handle stopping non-existent session gracefully', async () => {
        await expect(service.stopSession('non-existent')).resolves.not.toThrow();
      });
    });

    describe('isSessionRunning', () => {
      it('should return false for non-existent session', () => {
        expect(service.isSessionRunning('non-existent')).toBe(false);
      });

      it('should return false for idle session', async () => {
        vi.mocked(secureFs.writeFile).mockResolvedValue(undefined);

        const session = await service.startSession(testProjectPath);
        expect(service.isSessionRunning(session.id)).toBe(false);
      });
    });
  });

  // ============================================================================
  // Ideas CRUD Tests
  // ============================================================================

  describe('Ideas CRUD', () => {
    describe('createIdea', () => {
      it('should create a new idea with required fields', async () => {
        vi.mocked(secureFs.mkdir).mockResolvedValue(undefined);
        vi.mocked(secureFs.writeFile).mockResolvedValue(undefined);

        const input: CreateIdeaInput = {
          title: 'Test Idea',
          description: 'This is a test idea',
          category: 'features',
        };

        const idea = await service.createIdea(testProjectPath, input);

        expect(idea).toBeDefined();
        expect(idea.id).toMatch(/^idea-/);
        expect(idea.title).toBe('Test Idea');
        expect(idea.description).toBe('This is a test idea');
        expect(idea.category).toBe('features');
        expect(idea.status).toBe('raw');
        expect(idea.impact).toBe('medium');
        expect(idea.effort).toBe('medium');
        expect(secureFs.mkdir).toHaveBeenCalled();
        expect(secureFs.writeFile).toHaveBeenCalled();
      });

      it('should create idea with all optional fields', async () => {
        vi.mocked(secureFs.mkdir).mockResolvedValue(undefined);
        vi.mocked(secureFs.writeFile).mockResolvedValue(undefined);

        const input: CreateIdeaInput = {
          title: 'Full Idea',
          description: 'Complete idea',
          category: 'features',
          status: 'refined',
          impact: 'high',
          effort: 'low',
          conversationId: 'conv-123',
          sourcePromptId: 'prompt-123',
          userStories: ['Story 1', 'Story 2'],
          notes: 'Additional notes',
        };

        const idea = await service.createIdea(testProjectPath, input);

        expect(idea.status).toBe('refined');
        expect(idea.impact).toBe('high');
        expect(idea.effort).toBe('low');
        expect(idea.conversationId).toBe('conv-123');
        expect(idea.sourcePromptId).toBe('prompt-123');
        expect(idea.userStories).toEqual(['Story 1', 'Story 2']);
        expect(idea.notes).toBe('Additional notes');
      });
    });

    describe('getIdeas', () => {
      it('should return empty array when ideas directory does not exist', async () => {
        vi.mocked(secureFs.access).mockRejectedValue(new Error('ENOENT'));

        const ideas = await service.getIdeas(testProjectPath);

        expect(ideas).toEqual([]);
      });

      it('should load all ideas from disk', async () => {
        vi.mocked(secureFs.access).mockResolvedValue(undefined);
        vi.mocked(secureFs.readdir).mockResolvedValue([
          { name: 'idea-1', isDirectory: () => true } as any,
          { name: 'idea-2', isDirectory: () => true } as any,
        ]);

        const idea1: Idea = {
          id: 'idea-1',
          title: 'Idea 1',
          description: 'First idea',
          category: 'features',
          status: 'raw',
          impact: 'medium',
          effort: 'medium',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        const idea2: Idea = {
          id: 'idea-2',
          title: 'Idea 2',
          description: 'Second idea',
          category: 'bugs',
          status: 'refined',
          impact: 'high',
          effort: 'low',
          createdAt: '2024-01-02T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        };

        vi.mocked(secureFs.readFile)
          .mockResolvedValueOnce(JSON.stringify(idea1))
          .mockResolvedValueOnce(JSON.stringify(idea2));

        const ideas = await service.getIdeas(testProjectPath);

        expect(ideas).toHaveLength(2);
        expect(ideas[0].id).toBe('idea-2'); // Sorted by updatedAt descending
        expect(ideas[1].id).toBe('idea-1');
      });

      it('should skip invalid idea files', async () => {
        vi.mocked(secureFs.access).mockResolvedValue(undefined);
        vi.mocked(secureFs.readdir).mockResolvedValue([
          { name: 'idea-1', isDirectory: () => true } as any,
          { name: 'idea-2', isDirectory: () => true } as any,
        ]);

        const validIdea: Idea = {
          id: 'idea-1',
          title: 'Valid Idea',
          description: 'Valid',
          category: 'features',
          status: 'raw',
          impact: 'medium',
          effort: 'medium',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(secureFs.readFile)
          .mockResolvedValueOnce(JSON.stringify(validIdea))
          .mockRejectedValueOnce(new Error('Invalid JSON'));

        const ideas = await service.getIdeas(testProjectPath);

        expect(ideas).toHaveLength(1);
        expect(ideas[0].id).toBe('idea-1');
      });
    });

    describe('getIdea', () => {
      it('should return idea by id', async () => {
        const mockIdea: Idea = {
          id: 'idea-123',
          title: 'Test Idea',
          description: 'Test',
          category: 'features',
          status: 'raw',
          impact: 'medium',
          effort: 'medium',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(mockIdea));

        const idea = await service.getIdea(testProjectPath, 'idea-123');

        expect(idea).toBeDefined();
        expect(idea?.id).toBe('idea-123');
      });

      it('should return null for non-existent idea', async () => {
        vi.mocked(secureFs.readFile).mockRejectedValue(new Error('ENOENT'));

        const idea = await service.getIdea(testProjectPath, 'non-existent');

        expect(idea).toBeNull();
      });
    });

    describe('updateIdea', () => {
      it('should update idea fields', async () => {
        const existingIdea: Idea = {
          id: 'idea-123',
          title: 'Original Title',
          description: 'Original',
          category: 'features',
          status: 'raw',
          impact: 'medium',
          effort: 'medium',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(existingIdea));
        vi.mocked(secureFs.writeFile).mockResolvedValue(undefined);

        const updates: UpdateIdeaInput = {
          title: 'Updated Title',
          status: 'refined',
        };

        const updated = await service.updateIdea(testProjectPath, 'idea-123', updates);

        expect(updated).toBeDefined();
        expect(updated?.title).toBe('Updated Title');
        expect(updated?.status).toBe('refined');
        expect(updated?.description).toBe('Original'); // Unchanged
        expect(updated?.updatedAt).not.toBe('2024-01-01T00:00:00.000Z'); // Should be updated
      });

      it('should return null for non-existent idea', async () => {
        vi.mocked(secureFs.readFile).mockRejectedValue(new Error('ENOENT'));

        const updated = await service.updateIdea(testProjectPath, 'non-existent', {
          title: 'New Title',
        });

        expect(updated).toBeNull();
      });
    });

    describe('deleteIdea', () => {
      it('should delete idea directory', async () => {
        vi.mocked(secureFs.rm).mockResolvedValue(undefined);

        await service.deleteIdea(testProjectPath, 'idea-123');

        expect(secureFs.rm).toHaveBeenCalledWith(
          expect.stringContaining('idea-123'),
          expect.objectContaining({ recursive: true })
        );
      });

      it('should handle non-existent idea gracefully', async () => {
        vi.mocked(secureFs.rm).mockRejectedValue(new Error('ENOENT'));

        await expect(service.deleteIdea(testProjectPath, 'non-existent')).resolves.not.toThrow();
      });
    });

    describe('archiveIdea', () => {
      it('should set idea status to archived', async () => {
        const existingIdea: Idea = {
          id: 'idea-123',
          title: 'Test',
          description: 'Test',
          category: 'features',
          status: 'raw',
          impact: 'medium',
          effort: 'medium',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(existingIdea));
        vi.mocked(secureFs.writeFile).mockResolvedValue(undefined);

        const archived = await service.archiveIdea(testProjectPath, 'idea-123');

        expect(archived).toBeDefined();
        expect(archived?.status).toBe('archived');
      });
    });
  });

  // ============================================================================
  // Conversion Tests
  // ============================================================================

  describe('Idea to Feature Conversion', () => {
    describe('convertToFeature', () => {
      it('should convert idea to feature with basic fields', async () => {
        const mockIdea: Idea = {
          id: 'idea-123',
          title: 'Add Dark Mode',
          description: 'Implement dark mode theme',
          category: 'feature',
          status: 'refined',
          impact: 'high',
          effort: 'medium',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(mockIdea));

        const feature = await service.convertToFeature(testProjectPath, 'idea-123');

        expect(feature).toBeDefined();
        expect(feature.id).toMatch(/^feature-/);
        expect(feature.title).toBe('Add Dark Mode');
        expect(feature.description).toBe('Implement dark mode theme');
        expect(feature.category).toBe('ui'); // features -> ui mapping
        expect(feature.status).toBe('backlog');
      });

      it('should include user stories in feature description', async () => {
        const mockIdea: Idea = {
          id: 'idea-123',
          title: 'Test',
          description: 'Base description',
          category: 'features',
          status: 'refined',
          impact: 'medium',
          effort: 'medium',
          userStories: ['As a user, I want X', 'As a user, I want Y'],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(mockIdea));

        const feature = await service.convertToFeature(testProjectPath, 'idea-123');

        expect(feature.description).toContain('Base description');
        expect(feature.description).toContain('## User Stories');
        expect(feature.description).toContain('As a user, I want X');
        expect(feature.description).toContain('As a user, I want Y');
      });

      it('should include notes in feature description', async () => {
        const mockIdea: Idea = {
          id: 'idea-123',
          title: 'Test',
          description: 'Base description',
          category: 'features',
          status: 'refined',
          impact: 'medium',
          effort: 'medium',
          notes: 'Important implementation notes',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(mockIdea));

        const feature = await service.convertToFeature(testProjectPath, 'idea-123');

        expect(feature.description).toContain('Base description');
        expect(feature.description).toContain('## Notes');
        expect(feature.description).toContain('Important implementation notes');
      });

      it('should throw error for non-existent idea', async () => {
        vi.mocked(secureFs.readFile).mockRejectedValue(new Error('ENOENT'));

        await expect(service.convertToFeature(testProjectPath, 'non-existent')).rejects.toThrow(
          'Idea non-existent not found'
        );
      });
    });
  });

  // ============================================================================
  // Project Analysis Tests
  // ============================================================================

  describe('Project Analysis', () => {
    describe('analyzeProject', () => {
      it('should analyze project and generate suggestions', async () => {
        vi.mocked(secureFs.readFile).mockResolvedValue(
          JSON.stringify({
            name: 'test-project',
            dependencies: {},
          })
        );
        vi.mocked(secureFs.writeFile).mockResolvedValue(undefined);
        vi.mocked(secureFs.access).mockResolvedValue(undefined);
        vi.mocked(secureFs.readdir).mockResolvedValue([]);

        const result = await service.analyzeProject(testProjectPath);

        expect(result).toBeDefined();
        expect(result.projectPath).toBe(testProjectPath);
        expect(result.analyzedAt).toBeDefined();
        expect(result.suggestions).toBeDefined();
        expect(Array.isArray(result.suggestions)).toBe(true);
        expect(mockEvents.emit).toHaveBeenCalledWith(
          'ideation:analysis',
          expect.objectContaining({
            type: 'ideation:analysis-started',
          })
        );
        expect(mockEvents.emit).toHaveBeenCalledWith(
          'ideation:analysis',
          expect.objectContaining({
            type: 'ideation:analysis-complete',
          })
        );
      });

      it('should emit error event on failure', async () => {
        // Mock writeFile to fail (this is called after gatherProjectStructure and isn't caught)
        vi.mocked(secureFs.readFile).mockResolvedValue(
          JSON.stringify({
            name: 'test-project',
            dependencies: {},
          })
        );
        vi.mocked(secureFs.writeFile).mockRejectedValue(new Error('Write failed'));

        await expect(service.analyzeProject(testProjectPath)).rejects.toThrow();

        expect(mockEvents.emit).toHaveBeenCalledWith(
          'ideation:analysis',
          expect.objectContaining({
            type: 'ideation:analysis-error',
          })
        );
      });
    });

    describe('getCachedAnalysis', () => {
      it('should return cached analysis if exists', async () => {
        const mockAnalysis = {
          projectPath: testProjectPath,
          analyzedAt: '2024-01-01T00:00:00.000Z',
          totalFiles: 10,
          suggestions: [],
          summary: 'Test summary',
        };

        vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(mockAnalysis));

        const result = await service.getCachedAnalysis(testProjectPath);

        expect(result).toEqual(mockAnalysis);
      });

      it('should return null if cache does not exist', async () => {
        vi.mocked(secureFs.readFile).mockRejectedValue(new Error('ENOENT'));

        const result = await service.getCachedAnalysis(testProjectPath);

        expect(result).toBeNull();
      });
    });
  });

  // ============================================================================
  // Prompt Management Tests
  // ============================================================================

  describe('Prompt Management', () => {
    describe('getPromptCategories', () => {
      it('should return list of prompt categories', () => {
        const categories = service.getPromptCategories();

        expect(Array.isArray(categories)).toBe(true);
        expect(categories.length).toBeGreaterThan(0);
        expect(categories[0]).toHaveProperty('id');
        expect(categories[0]).toHaveProperty('name');
      });
    });

    describe('getAllPrompts', () => {
      it('should return all guided prompts', () => {
        const prompts = service.getAllPrompts();

        expect(Array.isArray(prompts)).toBe(true);
        expect(prompts.length).toBeGreaterThan(0);
        expect(prompts[0]).toHaveProperty('id');
        expect(prompts[0]).toHaveProperty('category');
        expect(prompts[0]).toHaveProperty('title');
        expect(prompts[0]).toHaveProperty('prompt');
      });
    });

    describe('getPromptsByCategory', () => {
      it('should return prompts filtered by category', () => {
        const allPrompts = service.getAllPrompts();
        const firstCategory = allPrompts[0].category;

        const filtered = service.getPromptsByCategory(firstCategory);

        expect(Array.isArray(filtered)).toBe(true);
        filtered.forEach((prompt) => {
          expect(prompt.category).toBe(firstCategory);
        });
      });

      it('should return empty array for non-existent category', () => {
        const filtered = service.getPromptsByCategory('non-existent-category' as any);

        expect(filtered).toEqual([]);
      });
    });
  });

  // ============================================================================
  // Suggestions Generation Tests
  // ============================================================================

  describe('Suggestion Generation', () => {
    describe('generateSuggestions', () => {
      it('should generate suggestions for a prompt', async () => {
        vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify({}));

        const mockProvider = {
          executeQuery: vi.fn().mockReturnValue({
            async *[Symbol.asyncIterator]() {
              yield {
                type: 'result',
                subtype: 'success',
                result: JSON.stringify([
                  {
                    title: 'Add user authentication',
                    description: 'Implement auth',
                    category: 'security',
                    impact: 'high',
                    effort: 'high',
                  },
                ]),
              };
            },
          }),
        };

        vi.mocked(ProviderFactory.getProviderForModel).mockReturnValue(mockProvider as any);

        const prompts = service.getAllPrompts();
        const firstPrompt = prompts[0];

        const suggestions = await service.generateSuggestions(
          testProjectPath,
          firstPrompt.id,
          'features',
          5
        );

        expect(Array.isArray(suggestions)).toBe(true);
        expect(mockEvents.emit).toHaveBeenCalledWith(
          'ideation:suggestions',
          expect.objectContaining({
            type: 'started',
          })
        );
      });

      it('should throw error for non-existent prompt', async () => {
        await expect(
          service.generateSuggestions(testProjectPath, 'non-existent', 'features', 5)
        ).rejects.toThrow('Prompt non-existent not found');
      });
    });
  });
});
