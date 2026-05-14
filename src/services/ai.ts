import { GoogleGenAI } from "@google/genai";
import { AgentRole, Task, BusinessGoal, OperationLog } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export class NexusExecutive {
  private static instance: NexusExecutive;
  
  private constructor() {}

  public static getInstance(): NexusExecutive {
    if (!NexusExecutive.instance) {
      NexusExecutive.instance = new NexusExecutive();
    }
    return NexusExecutive.instance;
  }

  /**
   * Executive AI breaks down a complex business goal into a structured plan.
   */
  public async planExecution(goal: string): Promise<Task[]> {
    const prompt = `
      You are the Executive AI of Nexus Autonomous Corp. 
      A user has provided a high-level business goal: "${goal}".
      
      Break this goal down into at least 6 actionable tasks that involve different agents.
      Assign each task to one of the following Agent Roles:
      - MARKETING
      - CONTENT
      - SOCIAL
      - LEAD_GEN
      - SALES
      - SALES_MGR
      - SUPPORT
      - ANALYTICS
      - OPERATIONS

      Return ONLY a JSON array of tasks with this structure:
      {
        "id": "string (unique)",
        "title": "string",
        "description": "string",
        "assignedTo": "AgentRole",
        "dependencies": ["string id"]
      }
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      const text = response.text || "[]";
      const tasks = JSON.parse(text) as any[];
      
      return tasks.map(t => ({
        ...t,
        status: 'PENDING',
        createdAt: Date.now(),
      }));
    } catch (error) {
      console.error("Executive Planning Error:", error);
      return [];
    }
  }

  /**
   * Simulates an agent performing a task.
   */
  public async executeTask(agentRole: AgentRole, taskDescription: string, context: string): Promise<string> {
    const prompt = `
      You are the ${agentRole} at Nexus Autonomous Corp.
      Your task is: ${taskDescription}
      Context from previous operations: ${context}
      
      Produce a concise report or output for this task. Focus on actionable results, strategy, or creative output.
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      return response.text || "Task completed with no specific output.";
    } catch (error) {
      console.error("Task Completion Error:", error);
      return "Execution failed due to internal error.";
    }
  }

  /**
   * Generates business insights based on current state.
   */
  public async analyzePerformance(goalDescription: string, tasks: Task[]): Promise<any> {
    const completedTasks = tasks.filter(t => t.status === 'COMPLETED');
    const prompt = `
      As the Analytics AI of Nexus Autonomous Corp, analyze our current trajectory:
      Objective: ${goalDescription}
      Progress: ${completedTasks.length}/${tasks.length} tasks completed.
      
      Completed Reports:
      ${completedTasks.map(t => `- ${t.title}: ${t.output?.substring(0, 200)}`).join('\n')}

      Generate 3 specific business KPIs that would be relevant to this objective. 
      For each KPI, provide a label, a realistic numeric/percentage value, and a trend (up, down, or neutral).
      
      Return ONLY JSON:
      {
        "kpis": [{ "label": "string", "value": "string", "trend": "up|down|neutral" }]
      }
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      return JSON.parse(response.text || '{"kpis": []}');
    } catch (error) {
      console.error("KPI Analysis Error:", error);
      return { kpis: [] };
    }
  }
}
