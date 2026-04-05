import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, ExternalLink, Loader2 } from "lucide-react";

type TranscriptListItem = {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string | null;
  folderPath?: string;
  sessionFolder?: string;
  studentNumber?: number;
  conversationTag?: "conv1" | "conv2";
  isDialogicEligible?: boolean;
};

type TranscriptFolderGroup = {
  folderName: string;
  transcripts: TranscriptListItem[];
};

type TranscriptDetail = {
  id: string;
  title: string;
  content: string;
  webViewLink?: string | null;
};

interface TestFeedbackProps {
  username: string;
  onStartDialogue: (payload: { conversationId: string; conversationNumber: number }) => void;
}

async function parseJsonOrThrow(response: Response): Promise<any> {
  const contentType = response.headers.get("content-type") || "";
  const rawText = await response.text();

  if (!response.ok) {
    throw new Error(rawText || `Failed with status ${response.status}`);
  }

  if (!contentType.includes("application/json")) {
    const preview = rawText.slice(0, 120).replace(/\s+/g, " ");
    throw new Error(`Expected JSON response but received: ${preview}`);
  }

  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error("Server returned invalid JSON payload.");
  }
}

function renderTranscriptWithSpeakers(content: string) {
  const lines = content.split(/\r?\n/);

  return lines.map((line, index) => {
    const speakerMatch = line.match(/^(\s*)(Ayelet|student)(\s*:\s*)(.*)$/i);

    if (!speakerMatch) {
      return (
        <p key={`line-${index}`} className="min-h-[1.75rem]">
          {line}
        </p>
      );
    }

    const [, leadingSpace, speaker, separator, text] = speakerMatch;

    return (
      <p key={`line-${index}`} className="min-h-[1.75rem]">
        {leadingSpace}
        <span className="font-bold">{speaker}</span>
        <span>{separator}</span>
        <span>{text}</span>
      </p>
    );
  });
}

function getStudentFolderLabel(item: TranscriptListItem): string {
  const pathParts = (item.folderPath || item.sessionFolder || "Root")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  const studentFolder = pathParts.find((part) => /student[_-]?\d+/i.test(part));
  return studentFolder || item.sessionFolder || "Root";
}

function getTranscriptPhaseOrder(name: string): number {
  const normalized = name.toLowerCase();

  if (normalized.includes("conv1")) return 1;
  if (normalized.includes("feedback1")) return 2;
  if (normalized.includes("conv2")) return 3;
  if (normalized.includes("feedback2")) return 4;

  return 99;
}

function sortTranscriptItems(transcripts: TranscriptListItem[]): TranscriptListItem[] {
  return [...transcripts].sort((a, b) => {
    const phaseCompare = getTranscriptPhaseOrder(a.name) - getTranscriptPhaseOrder(b.name);
    if (phaseCompare !== 0) {
      return phaseCompare;
    }

    return a.name.localeCompare(b.name);
  });
}

export default function TestFeedback({ username, onStartDialogue }: TestFeedbackProps) {
  const [transcripts, setTranscripts] = useState<TranscriptListItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [selectedTranscript, setSelectedTranscript] = useState<TranscriptDetail | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const loadTranscripts = async () => {
      setIsLoadingList(true);
      setErrorMessage("");

      try {
        const response = await fetch("/api/test-feedback/transcripts", {
          headers: {
            "x-test-feedback-username": username,
          },
          credentials: "include",
        });

        const data = await parseJsonOrThrow(response);
        const items = (data?.transcripts || []) as TranscriptListItem[];
        setTranscripts(items);

        if (items.length > 0) {
          setSelectedDocId(items[0].id);
        }
      } catch (error) {
        console.error("Failed to load transcript list:", error);
        setErrorMessage("Could not load transcripts from Google Drive.");
      } finally {
        setIsLoadingList(false);
      }
    };

    if (username) {
      loadTranscripts();
    }
  }, [username]);

  useEffect(() => {
    const loadTranscript = async () => {
      if (!selectedDocId) {
        setSelectedTranscript(null);
        return;
      }

      setIsLoadingTranscript(true);
      setErrorMessage("");

      try {
        const response = await fetch(`/api/test-feedback/transcripts/${selectedDocId}`, {
          headers: {
            "x-test-feedback-username": username,
          },
          credentials: "include",
        });

        const data = (await parseJsonOrThrow(response)) as TranscriptDetail;
        setSelectedTranscript(data);
      } catch (error) {
        console.error("Failed to load transcript:", error);
        setErrorMessage("Could not load the selected transcript.");
      } finally {
        setIsLoadingTranscript(false);
      }
    };

    if (username) {
      loadTranscript();
    }
  }, [selectedDocId, username]);

  const selectedName = useMemo(() => {
    return transcripts.find((t) => t.id === selectedDocId)?.name || "";
  }, [selectedDocId, transcripts]);

  const selectedTranscriptMeta = useMemo(() => {
    return transcripts.find((t) => t.id === selectedDocId);
  }, [selectedDocId, transcripts]);

  const folderGroups = useMemo(() => {
    const groups = new Map<string, TranscriptListItem[]>();

    for (const item of transcripts) {
      const folderName = getStudentFolderLabel(item);
      const existing = groups.get(folderName) || [];
      existing.push(item);
      groups.set(folderName, existing);
    }

    return Array.from(groups.entries())
      .map(([folderName, groupTranscripts]) => ({
        folderName,
        transcripts: sortTranscriptItems(groupTranscripts),
      }))
      .sort((a, b) => a.folderName.localeCompare(b.folderName, undefined, { numeric: true }));
  }, [transcripts]);

  const canStartDialogic = Boolean(selectedTranscriptMeta?.isDialogicEligible);

  const handleStartFeedback = async () => {
    if (!selectedTranscript?.content) {
      setFeedbackError("Please select a transcript first");
      return;
    }

    if (!canStartDialogic) {
      setFeedbackError("Dialogic feedback can be started only for conv1 or conv2 files.");
      return;
    }

    setIsGeneratingFeedback(true);
    setFeedbackError("");

    try {
      const response = await fetch("/api/test-feedback/start-dialogue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-feedback-username": username,
        },
        body: JSON.stringify({
          transcriptContent: selectedTranscript.content,
          transcriptName: selectedTranscriptMeta?.name || selectedTranscript.title,
        }),
        credentials: "include",
      });

      const data = await parseJsonOrThrow(response);
      onStartDialogue({
        conversationId: data.conversationId,
        conversationNumber: data.conversationNumber,
      });
    } catch (error) {
      console.error("Failed to start dialogic feedback:", error);
      setFeedbackError(`Failed to start dialogic feedback: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsGeneratingFeedback(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-slate-800">Conversations Reader</h2>
        <p className="text-slate-600 mt-1">
          Read Google Docs Conversations directly from Drive.
        </p>
      </div>

      {errorMessage && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="grid lg:grid-cols-[320px,1fr] gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Available Transcripts</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingList ? (
              <p className="text-sm text-slate-500">Loading transcripts...</p>
            ) : transcripts.length === 0 ? (
              <p className="text-sm text-slate-500">No Google Docs found in this folder.</p>
            ) : (
              <ScrollArea className="h-[480px] pr-2">
                <div className="space-y-2">
                  {folderGroups.map((group) => (
                    <div key={group.folderName} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2">
                      <div className="flex items-center justify-between px-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                        {group.folderName}
                        </p>
                        <p className="text-[10px] text-slate-400">student folder</p>
                      </div>
                      {group.transcripts.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedDocId(item.id)}
                          className={`w-full text-left px-3 py-3 rounded-md border transition-colors ${
                            item.id === selectedDocId
                              ? "bg-blue-50 border-blue-300"
                              : "bg-white border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <FileText className="w-4 h-4 mt-0.5 text-slate-500" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">{item.name}</p>
                              <div className="mt-1 flex items-center gap-2">
                                {item.name.toLowerCase().includes("conv") && (
                                  <span className="text-[10px] font-semibold uppercase tracking-wide rounded bg-blue-100 px-1.5 py-0.5 text-blue-800">
                                    {item.name.toLowerCase().includes("conv1")
                                      ? "conv1"
                                      : item.name.toLowerCase().includes("conv2")
                                        ? "conv2"
                                        : "conv"}
                                  </span>
                                )}
                                {item.name.toLowerCase().includes("feedback") && (
                                  <span className="text-[10px] font-semibold uppercase tracking-wide rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">
                                    {item.name.toLowerCase().includes("feedback1")
                                      ? "feedback1"
                                      : item.name.toLowerCase().includes("feedback2")
                                        ? "feedback2"
                                        : "feedback"}
                                  </span>
                                )}
                                {!item.isDialogicEligible && (
                                  <span className="text-[10px] rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                                    read only
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 mt-1">
                                {item.modifiedTime
                                  ? `Updated ${new Date(item.modifiedTime).toLocaleString()}`
                                  : "No modified date"}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-base truncate">
              {selectedTranscript?.title || selectedName || "Select a transcript"}
            </CardTitle>
            <div className="flex gap-2">
              {selectedTranscript?.webViewLink && (
                <Button asChild variant="outline" size="sm">
                  <a href={selectedTranscript.webViewLink} target="_blank" rel="noopener noreferrer">
                    Open in Google Docs
                    <ExternalLink className="ml-2 w-4 h-4" />
                  </a>
                </Button>
              )}
              <Button
                onClick={handleStartFeedback}
                disabled={isGeneratingFeedback || !selectedTranscript?.content || !canStartDialogic}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isGeneratingFeedback ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Preparing...
                  </>
                ) : (
                  "Start Dialogic Feedback"
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingTranscript ? (
              <p className="text-sm text-slate-500">Loading transcript content...</p>
            ) : selectedTranscript ? (
              <ScrollArea className="h-[520px] pr-4">
                <div className="leading-7 text-slate-700 text-sm space-y-1">
                  {selectedTranscript.content
                    ? renderTranscriptWithSpeakers(selectedTranscript.content)
                    : "This document has no text content."}
                </div>
              </ScrollArea>
            ) : (
              <p className="text-sm text-slate-500">Choose a transcript from the list.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {feedbackError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {feedbackError}
        </div>
      )}
    </div>
  );
}
