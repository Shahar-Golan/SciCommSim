import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Download, Settings, Users, Clock, Star } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TrainingSession, AiPrompt } from "@shared/schema";

type SessionWithDetails = TrainingSession & {
  studentName: string;
  conversations: any[];
  feedbacks: any[];
};

export default function AdminDashboard() {
  const [sessions, setSessions] = useState<SessionWithDetails[]>([]);
  const [prompts, setPrompts] = useState<AiPrompt[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionWithDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingPrompt, setEditingPrompt] = useState<{ name: string; content: string } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [sessionsResponse, promptsResponse] = await Promise.all([
        apiRequest("GET", "/api/admin/sessions"),
        apiRequest("GET", "/api/admin/prompts"),
      ]);

      const sessionsData = await sessionsResponse.json();
      const promptsData = await promptsResponse.json();

      setSessions(sessionsData);
      setPrompts(promptsData);
    } catch (error) {
      console.error("Failed to load admin data:", error);
      toast({
        title: "Error",
        description: "Failed to load dashboard data.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePrompt = async () => {
    if (!editingPrompt) return;

    try {
      await apiRequest("PATCH", `/api/admin/prompts/${editingPrompt.name}`, {
        prompt: editingPrompt.content,
      });

      await loadData();
      setEditingPrompt(null);
      
      toast({
        title: "Success",
        description: "Prompt updated successfully.",
      });
    } catch (error) {
      console.error("Failed to update prompt:", error);
      toast({
        title: "Error",
        description: "Failed to update prompt.",
        variant: "destructive",
      });
    }
  };

  const exportData = () => {
    const data = {
      sessions,
      timestamp: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `training-data-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Export Complete",
      description: "Training data has been downloaded.",
    });
  };

  const completedSessions = sessions.filter(s => s.completedAt);
  const avgHelpfulness = completedSessions.length > 0 
    ? completedSessions.reduce((sum, s) => sum + (s.helpfulnessRating || 0), 0) / completedSessions.length 
    : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-slate-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 text-white min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Researcher Dashboard</h1>
          <div className="flex items-center space-x-4">
            <Button 
              onClick={exportData}
              className="bg-blue-500 hover:bg-blue-600"
              data-testid="button-export-data"
            >
              <Download className="mr-2 w-4 h-4" />
              Export Data
            </Button>
            <Button 
              variant="outline" 
              className="bg-slate-700 hover:bg-slate-600 border-slate-600"
            >
              <Settings className="mr-2 w-4 h-4" />
              Settings
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <Card className="bg-slate-700 border-slate-600">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-300 text-sm">Total Sessions</p>
                  <p className="text-2xl font-bold" data-testid="total-sessions">
                    {sessions.length}
                  </p>
                </div>
                <Users className="text-blue-500 w-8 h-8" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-slate-700 border-slate-600">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-300 text-sm">Completed Sessions</p>
                  <p className="text-2xl font-bold" data-testid="completed-sessions">
                    {completedSessions.length}
                  </p>
                </div>
                <Clock className="text-green-500 w-8 h-8" />
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-slate-700 border-slate-600">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-300 text-sm">Avg. Helpfulness</p>
                  <p className="text-2xl font-bold" data-testid="avg-helpfulness">
                    {avgHelpfulness.toFixed(1)}/5
                  </p>
                </div>
                <Star className="text-yellow-500 w-8 h-8" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Recent Sessions */}
          <Card className="bg-slate-700 border-slate-600">
            <CardHeader>
              <CardTitle>Recent Sessions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-600">
                      <th className="text-left py-2">Student Name</th>
                      <th className="text-left py-2">Date</th>
                      <th className="text-left py-2">Status</th>
                      <th className="text-left py-2">Rating</th>
                      <th className="text-left py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody data-testid="sessions-table">
                    {sessions.slice(0, 10).map((session) => (
                      <tr key={session.id} className="border-b border-slate-600">
                        <td className="py-2">
                          {session.studentName}
                        </td>
                        <td className="py-2 text-slate-300">
                          {new Date(session.startedAt || '').toLocaleDateString()}
                        </td>
                        <td className="py-2">
                          <Badge 
                            variant={session.completedAt ? "default" : "secondary"}
                            className={session.completedAt ? "bg-green-600" : "bg-yellow-600"}
                          >
                            {session.completedAt ? "Complete" : "In Progress"}
                          </Badge>
                        </td>
                        <td className="py-2">
                          {session.helpfulnessRating ? `${session.helpfulnessRating}/5` : "N/A"}
                        </td>
                        <td className="py-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedSession(session)}
                            className="bg-slate-800 border-slate-600 hover:bg-slate-600 text-xs"
                            data-testid={`view-session-${session.id}`}
                          >
                            View Details
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Prompt Management */}
          <Card className="bg-slate-700 border-slate-600">
            <CardHeader>
              <CardTitle>AI Prompts Management</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {prompts.map((prompt) => (
                  <div key={prompt.name} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-slate-300">
                        {prompt.name.replace('_', ' ').toUpperCase()}
                      </label>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingPrompt({ name: prompt.name, content: prompt.prompt })}
                        className="bg-slate-800 border-slate-600 hover:bg-slate-600"
                        data-testid={`edit-prompt-${prompt.name}`}
                      >
                        Edit
                      </Button>
                    </div>
                    
                    {editingPrompt?.name === prompt.name ? (
                      <div className="space-y-2">
                        <Textarea 
                          value={editingPrompt.content}
                          onChange={(e) => setEditingPrompt({ 
                            ...editingPrompt, 
                            content: e.target.value 
                          })}
                          rows={4} 
                          className="bg-slate-800 border-slate-600 text-white text-sm"
                          data-testid={`prompt-editor-${prompt.name}`}
                        />
                        <div className="flex space-x-2">
                          <Button 
                            size="sm" 
                            onClick={handleUpdatePrompt}
                            className="bg-blue-500 hover:bg-blue-600"
                          >
                            Save
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => setEditingPrompt(null)}
                            className="bg-slate-800 border-slate-600 hover:bg-slate-600"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2">
                        <p className="text-slate-300 text-xs line-clamp-3">
                          {prompt.prompt.slice(0, 200)}...
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Session Details Modal */}
        {selectedSession && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-700 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
              <div className="p-6 border-b border-slate-600 flex justify-between items-center">
                <h2 className="text-xl font-bold">Session Details: {selectedSession.studentName}</h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedSession(null)}
                  className="bg-slate-800 border-slate-600 hover:bg-slate-600"
                >
                  Close
                </Button>
              </div>
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                <div className="space-y-6">
                  {/* Session Info */}
                  <div className="grid grid-cols-2 gap-4 p-4 bg-slate-800 rounded-lg">
                    <div>
                      <p className="text-slate-300 text-sm">Started:</p>
                      <p className="font-medium">{new Date(selectedSession.startedAt || '').toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-slate-300 text-sm">Completed:</p>
                      <p className="font-medium">
                        {selectedSession.completedAt 
                          ? new Date(selectedSession.completedAt).toLocaleString()
                          : 'In Progress'
                        }
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-300 text-sm">Helpfulness Rating:</p>
                      <p className="font-medium">
                        {selectedSession.helpfulnessRating ? `${selectedSession.helpfulnessRating}/5` : 'Not rated'}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-300 text-sm">Conversations:</p>
                      <p className="font-medium">{selectedSession.conversations?.length || 0}</p>
                    </div>
                  </div>

                  {/* Experience Feedback */}
                  {selectedSession.experienceFeedback && (
                    <div className="p-4 bg-slate-800 rounded-lg">
                      <h3 className="font-medium mb-2">Student Feedback:</h3>
                      <p className="text-slate-300 text-sm">{selectedSession.experienceFeedback}</p>
                    </div>
                  )}

                  {/* Conversations */}
                  {selectedSession.conversations?.map((conversation, index) => (
                    <div key={conversation.id} className="border border-slate-600 rounded-lg">
                      <div className="p-4 bg-slate-800 border-b border-slate-600">
                        <h3 className="font-medium">Conversation {conversation.conversationNumber}</h3>
                        <div className="flex gap-4 mt-2 text-sm text-slate-300">
                          <span>Started: {new Date(conversation.startedAt).toLocaleString()}</span>
                          {conversation.endedAt && (
                            <span>Ended: {new Date(conversation.endedAt).toLocaleString()}</span>
                          )}
                          {conversation.duration && (
                            <span>Duration: {Math.floor(conversation.duration / 60)}m {conversation.duration % 60}s</span>
                          )}
                        </div>
                      </div>
                      
                      {/* Transcript */}
                      <div className="p-4">
                        <h4 className="font-medium mb-3">Transcript:</h4>
                        <div className="space-y-3 max-h-96 overflow-y-auto">
                          {conversation.transcript?.map((message: any, msgIndex: number) => (
                            <div key={msgIndex} className={`p-3 rounded-lg ${
                              message.role === 'student' 
                                ? 'bg-blue-900 bg-opacity-30 border-l-4 border-blue-500'
                                : 'bg-green-900 bg-opacity-30 border-l-4 border-green-500'
                            }`}>
                              <div className="flex justify-between items-start mb-1">
                                <span className="font-medium text-sm">
                                  {message.role === 'student' ? 'Student' : 'AI Layperson'}
                                </span>
                                <span className="text-xs text-slate-400">
                                  {new Date(message.timestamp).toLocaleTimeString()}
                                </span>
                              </div>
                              <p className="text-sm text-slate-200">{message.content}</p>
                            </div>
                          )) || []}
                        </div>
                      </div>
                      
                      {/* Feedback for this conversation */}
                      {(() => {
                        const conversationFeedback = selectedSession.feedbacks?.find(
                          (f: any) => f.conversationId === conversation.id
                        );
                        return conversationFeedback ? (
                          <div className="p-4 border-t border-slate-600 bg-slate-800">
                            <h4 className="font-medium mb-3">AI Feedback:</h4>
                            <div className="space-y-3">
                              {conversationFeedback.strengths && (
                                <div className="p-3 bg-green-900 bg-opacity-20 border-l-4 border-green-500 rounded">
                                  <h5 className="font-medium text-green-400 mb-1">Strengths:</h5>
                                  <p className="text-sm text-slate-200">{conversationFeedback.strengths}</p>
                                </div>
                              )}
                              {conversationFeedback.improvements && (
                                <div className="p-3 bg-blue-900 bg-opacity-20 border-l-4 border-blue-500 rounded">
                                  <h5 className="font-medium text-blue-400 mb-1">Areas for Improvement:</h5>
                                  <p className="text-sm text-slate-200">{conversationFeedback.improvements}</p>
                                </div>
                              )}
                              {conversationFeedback.recommendations && conversationFeedback.recommendations.length > 0 && (
                                <div className="p-3 bg-purple-900 bg-opacity-20 border-l-4 border-purple-500 rounded">
                                  <h5 className="font-medium text-purple-400 mb-2">Recommendations:</h5>
                                  <ul className="text-sm text-slate-200 space-y-1">
                                    {conversationFeedback.recommendations.map((rec: string, recIndex: number) => (
                                      <li key={recIndex} className="flex items-start">
                                        <span className="mr-2">•</span>
                                        <span>{rec}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  )) || []}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
