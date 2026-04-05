import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, ExternalLink, Loader2, CheckCircle } from "lucide-react";

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

type FeedbackQueueItem = {
  priority: number;
  type: "improvement" | "strength";
  concept: string;
  target_quote: string;
  issue_description: string;
};

interface TestFeedbackProps {
  username: string;
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

export default function TestFeedback({ username }: TestFeedbackProps) {
  const [transcripts, setTranscripts] = useState<TranscriptListItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [folderGroups, setFolderGroups] = useState<TranscriptFolderGroup[]>([]);
  const [selectedTranscript, setSelectedTranscript] = useState<TranscriptDetail | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [feedbackData, setFeedbackData] = useState<any>(null);
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

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Failed with status ${response.status}`);
        }

        const data = await response.json();
        const items = (data?.transcripts || []) as TranscriptListItem[];
        const groups = (data?.folders || []) as TranscriptFolderGroup[];
        setTranscripts(items);
        setFolderGroups(groups);

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

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Failed with status ${response.status}`);
        }

        const data = (await response.json()) as TranscriptDetail;
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
    setFeedbackData(null);

    try {
      const response = await fetch("/api/test-feedback/generate-feedback", {
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

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Failed with status ${response.status}`);
      }

      const data = await response.json();
      setFeedbackData(data);
    } catch (error) {
      console.error("Failed to generate feedback:", error);
      setFeedbackError(`Failed to generate feedback: ${error instanceof Error ? error.message : "Unknown error"}`);
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
                    <div key={group.folderName} className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 px-1">
                        {group.folderName}
                      </p>
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
                                {item.conversationTag && (
                                  <span className="text-[10px] font-semibold uppercase tracking-wide rounded bg-blue-100 px-1.5 py-0.5 text-blue-800">
                                    {item.conversationTag}
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
                    Generating...
                  </>
                ) : feedbackData ? (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Feedback Ready
                  </>
                ) : (
                  "Start Dialogic Feedback"
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!canStartDialogic && selectedTranscript && (
              <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                This file is not conv1/conv2. You can read it, but dialogic feedback is enabled only for conv1 or conv2 transcripts.
              </div>
            )}
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

      {feedbackData && (
        <div className="space-y-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Strengths</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-slate-700 whitespace-pre-wrap">
                  {feedbackData.strengths || "No clear strengths identified."}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Areas for Improvement</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-slate-700 whitespace-pre-wrap">
                  {feedbackData.improvements || "No specific improvements identified."}
                </div>
              </CardContent>
            </Card>
          </div>

          {feedbackData.feedbackQueue && feedbackData.feedbackQueue.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Detailed Feedback Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {feedbackData.feedbackQueue.map((item: FeedbackQueueItem) => (
                    <div key={`${item.priority}-${item.concept}`} className="border-l-4 border-blue-500 pl-4 py-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{item.concept}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            Type: {item.type === "strength" ? "Strength" : "Improvement"}
                          </p>
                        </div>
                        <span className="text-xs font-bold bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          #{item.priority}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 mt-2">{item.issue_description}</p>
                      {item.target_quote && (
                        <p className="text-xs text-slate-600 mt-2 italic">
                          Quote: "{item.target_quote}"
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="text-xs text-slate-500 text-center">
            Analyzed {feedbackData.messageCount} messages
          </div>
        </div>
      )}
    </div>
  );
}
