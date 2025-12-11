"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Bot,
  Send,
  User,
  Loader2,
  Sparkles,
  FileText,
  ArrowLeft,
  CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getElectronAPI } from "@/lib/electron";
import { safeJoin } from "@/lib/path-utils";

interface InterviewMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface InterviewState {
  projectName: string;
  projectDescription: string;
  techStack: string[];
  features: string[];
  additionalNotes: string;
}

// Interview questions flow
const INTERVIEW_QUESTIONS = [
  {
    id: "project-description",
    question: "What do you want to build?",
    hint: "Describe your project idea in a few sentences",
    field: "projectDescription" as const,
  },
  {
    id: "tech-stack",
    question: "What tech stack would you like to use?",
    hint: "e.g., React, Next.js, Node.js, Python, etc.",
    field: "techStack" as const,
  },
  {
    id: "core-features",
    question: "What are the core features you want to include?",
    hint: "List the main functionalities your app should have",
    field: "features" as const,
  },
  {
    id: "additional",
    question: "Any additional requirements or preferences?",
    hint: "Design preferences, integrations, deployment needs, etc.",
    field: "additionalNotes" as const,
  },
];

export function InterviewView() {
  const { setCurrentView, addProject, setCurrentProject, setAppSpec } =
    useAppStore();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [interviewData, setInterviewData] = useState<InterviewState>({
    projectName: "",
    projectDescription: "",
    techStack: [],
    features: [],
    additionalNotes: "",
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [generatedSpec, setGeneratedSpec] = useState<string | null>(null);
  const [projectPath, setProjectPath] = useState("");
  const [projectName, setProjectName] = useState("");
  const [showProjectSetup, setShowProjectSetup] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize with first question
  useEffect(() => {
    if (messages.length === 0) {
      const welcomeMessage: InterviewMessage = {
        id: "welcome",
        role: "assistant",
        content: `Hello! I'm here to help you plan your new project. Let's go through a few questions to understand what you want to build.\n\n**${INTERVIEW_QUESTIONS[0].question}**\n\n_${INTERVIEW_QUESTIONS[0].hint}_`,
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
    }
  }, [messages.length]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  // Auto-focus input
  useEffect(() => {
    if (inputRef.current && !isComplete) {
      inputRef.current.focus();
    }
  }, [currentQuestionIndex, isComplete]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isGenerating || isComplete) return;

    const userMessage: InterviewMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);

    // Update interview data based on current question
    const currentQuestion = INTERVIEW_QUESTIONS[currentQuestionIndex];
    if (currentQuestion) {
      setInterviewData((prev) => {
        const newData = { ...prev };
        if (
          currentQuestion.field === "techStack" ||
          currentQuestion.field === "features"
        ) {
          // Parse comma-separated values into array
          newData[currentQuestion.field] = input
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        } else {
          (newData as Record<string, string | string[]>)[
            currentQuestion.field
          ] = input;
        }
        return newData;
      });
    }

    setInput("");

    // Move to next question or complete
    const nextIndex = currentQuestionIndex + 1;

    setTimeout(() => {
      if (nextIndex < INTERVIEW_QUESTIONS.length) {
        const nextQuestion = INTERVIEW_QUESTIONS[nextIndex];
        const assistantMessage: InterviewMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: `Great! **${nextQuestion.question}**\n\n_${nextQuestion.hint}_`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setCurrentQuestionIndex(nextIndex);
      } else {
        // All questions answered - generate spec
        const summaryMessage: InterviewMessage = {
          id: `assistant-summary-${Date.now()}`,
          role: "assistant",
          content:
            "Perfect! I have all the information I need. Now let me generate your project specification...",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, summaryMessage]);
        generateSpec({
          ...interviewData,
          projectDescription:
            currentQuestionIndex === 0
              ? input
              : interviewData.projectDescription,
          techStack:
            currentQuestionIndex === 1
              ? input
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : interviewData.techStack,
          features:
            currentQuestionIndex === 2
              ? input
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : interviewData.features,
          additionalNotes:
            currentQuestionIndex === 3 ? input : interviewData.additionalNotes,
        });
      }
    }, 500);
  }, [input, isGenerating, isComplete, currentQuestionIndex, interviewData]);

  const generateSpec = useCallback(async (data: InterviewState) => {
    setIsGenerating(true);

    // Generate a draft app_spec.txt based on the interview responses
    const spec = generateAppSpec(data);

    // Simulate some processing time for better UX
    await new Promise((resolve) => setTimeout(resolve, 1500));

    setGeneratedSpec(spec);
    setIsGenerating(false);
    setIsComplete(true);
    setShowProjectSetup(true);

    const completionMessage: InterviewMessage = {
      id: `assistant-complete-${Date.now()}`,
      role: "assistant",
      content: `I've generated a draft project specification based on our conversation!\n\nPlease provide a project name and choose where to save your project, then click "Create Project" to get started.`,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, completionMessage]);
  }, []);

  const generateAppSpec = (data: InterviewState): string => {
    const projectName = data.projectDescription
      .split(" ")
      .slice(0, 3)
      .join("-")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");

    return `<project_specification>
  <project_name>${projectName || "my-project"}</project_name>

  <overview>
    ${data.projectDescription}
  </overview>

  <technology_stack>
    ${
      data.techStack.length > 0
        ? data.techStack
            .map((tech) => `<technology>${tech}</technology>`)
            .join("\n    ")
        : "<!-- Define your tech stack -->"
    }
  </technology_stack>

  <core_capabilities>
    ${
      data.features.length > 0
        ? data.features
            .map((feature) => `<capability>${feature}</capability>`)
            .join("\n    ")
        : "<!-- List core features -->"
    }
  </core_capabilities>

  <additional_requirements>
    ${data.additionalNotes || "None specified"}
  </additional_requirements>

  <development_guidelines>
    <guideline>Write clean, production-quality code</guideline>
    <guideline>Include proper error handling</guideline>
    <guideline>Write comprehensive Playwright tests</guideline>
    <guideline>Ensure all tests pass before marking features complete</guideline>
  </development_guidelines>
</project_specification>`;
  };

  const handleSelectDirectory = async () => {
    const api = await getElectronAPI();
    if (!api) {
      console.error("Failed to get Electron API");
      return;
    }
    const result = await api.openDirectory();

    if (!result.canceled && result.filePaths[0]) {
      setProjectPath(result.filePaths[0]);
    }
  };

  const handleCreateProject = async () => {
    if (!projectName || !projectPath || !generatedSpec) return;

    setIsGenerating(true);

    try {
      const api = await getElectronAPI();
      if (!api) {
        console.error("Failed to get Electron API");
        return;
      }
      const fullProjectPath = `${projectPath}/${projectName}`;

      // Create project directory
      await api.mkdir(fullProjectPath);

      // Write app_spec.txt with generated content
      await api.writeFile(
        safeJoin(fullProjectPath, '.automaker', 'app_spec.txt'),
        generatedSpec
      );

      // Create initial .automaker/feature_list.json
      await api.writeFile(
        safeJoin(fullProjectPath, '.automaker', 'feature_list.json'),
        JSON.stringify(
          [
            {
              category: "Core",
              description: "Initial project setup",
              steps: [
                "Step 1: Review app_spec.txt",
                "Step 2: Set up development environment",
                "Step 3: Start implementing features",
              ],
              passes: false,
            },
          ],
          null,
          2
        )
      );

      const project = {
        id: `project-${Date.now()}`,
        name: projectName,
        path: fullProjectPath,
        lastOpened: new Date().toISOString(),
      };

      // Update app spec in store
      setAppSpec(generatedSpec);

      // Add and select the project
      addProject(project);
      setCurrentProject(project);
    } catch (error) {
      console.error("Failed to create project:", error);
      setIsGenerating(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleGoBack = () => {
    setCurrentView("welcome");
  };

  return (
    <div
      className="flex-1 flex flex-col content-bg"
      data-testid="interview-view"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-glass backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleGoBack}
            className="h-8 w-8 p-0"
            data-testid="interview-back-button"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Sparkles className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-xl font-bold">New Project Interview</h1>
            <p className="text-sm text-muted-foreground">
              {isComplete
                ? "Specification generated!"
                : `Question ${currentQuestionIndex + 1} of ${
                    INTERVIEW_QUESTIONS.length
                  }`}
            </p>
          </div>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center gap-2">
          {INTERVIEW_QUESTIONS.map((_, index) => (
            <div
              key={index}
              className={cn(
                "w-2 h-2 rounded-full transition-colors",
                index < currentQuestionIndex
                  ? "bg-green-500"
                  : index === currentQuestionIndex
                  ? "bg-primary"
                  : "bg-zinc-700"
              )}
            />
          ))}
          {isComplete && (
            <CheckCircle className="w-4 h-4 text-green-500 ml-2" />
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
        data-testid="interview-messages"
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex gap-3",
              message.role === "user" && "flex-row-reverse"
            )}
          >
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                message.role === "assistant" ? "bg-primary/10" : "bg-muted"
              )}
            >
              {message.role === "assistant" ? (
                <Bot className="w-4 h-4 text-primary" />
              ) : (
                <User className="w-4 h-4" />
              )}
            </div>
            <Card
              className={cn(
                "max-w-[80%]",
                message.role === "user" && "bg-primary text-primary-foreground"
              )}
            >
              <CardContent className="p-3">
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                <p
                  className={cn(
                    "text-xs mt-2",
                    message.role === "user"
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground"
                  )}
                >
                  {message.timestamp.toLocaleTimeString()}
                </p>
              </CardContent>
            </Card>
          </div>
        ))}

        {isGenerating && !showProjectSetup && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">
                    Generating specification...
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Project Setup Form */}
        {showProjectSetup && (
          <div className="mt-6">
            <Card
              className="bg-zinc-900/50 border-white/10"
              data-testid="project-setup-form"
            >
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold">Create Your Project</h3>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="project-name"
                      className="text-sm font-medium text-zinc-300"
                    >
                      Project Name
                    </label>
                    <Input
                      id="project-name"
                      placeholder="my-awesome-project"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      className="bg-zinc-950/50 border-white/10 text-white placeholder:text-zinc-500"
                      data-testid="interview-project-name-input"
                    />
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="project-path"
                      className="text-sm font-medium text-zinc-300"
                    >
                      Parent Directory
                    </label>
                    <div className="flex gap-2">
                      <Input
                        id="project-path"
                        placeholder="/path/to/projects"
                        value={projectPath}
                        onChange={(e) => setProjectPath(e.target.value)}
                        className="flex-1 bg-zinc-950/50 border-white/10 text-white placeholder:text-zinc-500"
                        data-testid="interview-project-path-input"
                      />
                      <Button
                        variant="secondary"
                        onClick={handleSelectDirectory}
                        className="bg-white/5 hover:bg-white/10 text-white border border-white/10"
                        data-testid="interview-browse-directory"
                      >
                        Browse
                      </Button>
                    </div>
                  </div>

                  {/* Preview of generated spec */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-300">
                      Generated Specification Preview
                    </label>
                    <div
                      className="bg-zinc-950/50 border border-white/10 rounded-md p-3 max-h-48 overflow-y-auto"
                      data-testid="spec-preview"
                    >
                      <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono">
                        {generatedSpec}
                      </pre>
                    </div>
                  </div>

                  <Button
                    onClick={handleCreateProject}
                    disabled={!projectName || !projectPath || isGenerating}
                    className="w-full bg-linear-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-600 text-primary-foreground border-0"
                    data-testid="interview-create-project"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Create Project
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Input */}
      {!isComplete && (
        <div className="border-t p-4">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              placeholder="Type your answer..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isGenerating}
              data-testid="interview-input"
              className="flex-1"
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isGenerating}
              data-testid="interview-send"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
