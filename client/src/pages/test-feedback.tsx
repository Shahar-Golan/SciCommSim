import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, ExternalLink } from "lucide-react";

type TranscriptListItem = {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string | null;
  folderPath?: string;
  sessionFolder?: string;
  studentNumber?: number;
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
            {selectedTranscript?.webViewLink && (
              <Button asChild variant="outline" size="sm">
                <a href={selectedTranscript.webViewLink} target="_blank" rel="noopener noreferrer">
                  Open in Google Docs
                  <ExternalLink className="ml-2 w-4 h-4" />
                </a>
              </Button>
            )}
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
    </div>
  );
}
