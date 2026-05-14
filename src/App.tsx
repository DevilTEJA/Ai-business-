/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Building2, 
  Terminal, 
  BarChart3, 
  Users, 
  Cpu, 
  Activity, 
  ChevronRight, 
  Play, 
  CheckCircle2,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  LogIn,
  LogOut,
  Target,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc,
  serverTimestamp,
  getDoc
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { db, auth } from './services/firebase';
import { handleFirestoreError, OperationType } from './lib/firestoreUtils';
import { AGENTS } from './constants';
import { Agent, Task, BusinessGoal, OperationLog, AgentRole } from './types';
import { NexusExecutive } from './services/ai';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [goalInput, setGoalInput] = useState('');
  const [currentGoal, setCurrentGoal] = useState<BusinessGoal | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [agents, setAgents] = useState<Agent[]>(AGENTS);
  const [isPlanning, setIsPlanning] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const executive = NexusExecutive.getInstance();

  // Auth Listener
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const logout = () => auth.signOut();

  // Real-time Goal/Tasks/Logs Listener
  useEffect(() => {
    if (!user) {
      setCurrentGoal(null);
      setTasks([]);
      setLogs([]);
      return;
    }

    // For this app, we'll auto-load the latest active goal for the user
    // In a full app, you'd have a list of goals
    const goalsRef = collection(db, 'goals');
    const q = query(goalsRef, orderBy('createdAt', 'desc'));
    
    const unsubscribeGoals = onSnapshot(q, (snapshot) => {
      const activeGoalDoc = snapshot.docs.find(d => d.data().createdBy === user.uid);
      if (activeGoalDoc) {
        const goalData = { id: activeGoalDoc.id, ...activeGoalDoc.data() } as BusinessGoal;
        setCurrentGoal(goalData);

        // Nested listeners for Tasks and Logs
        const tasksRef = collection(db, `goals/${activeGoalDoc.id}/tasks`);
        const logsRef = collection(db, `goals/${activeGoalDoc.id}/logs`);

        onSnapshot(query(tasksRef, orderBy('createdAt', 'asc')), (taskSnap) => {
          setTasks(taskSnap.docs.map(d => ({ id: d.id, ...d.data() } as Task)));
        }, (err) => handleFirestoreError(err, OperationType.LIST, `goals/${activeGoalDoc.id}/tasks`));

        onSnapshot(query(logsRef, orderBy('timestamp', 'asc')), (logSnap) => {
          setLogs(logSnap.docs.map(d => ({ id: d.id, ...d.data() } as OperationLog)));
        }, (err) => handleFirestoreError(err, OperationType.LIST, `goals/${activeGoalDoc.id}/logs`));
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'goals'));

    return () => unsubscribeGoals();
  }, [user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Sync Agent statuses and calculate metrics based on tasks
  useEffect(() => {
    const workingAgents = new Set(tasks.filter(t => t.status === 'IN_PROGRESS').map(t => t.assignedTo));
    setAgents(prev => prev.map(a => {
      const agentTasks = tasks.filter(t => t.assignedTo === a.id);
      const totalTasks = agentTasks.length;
      const completedTasks = agentTasks.filter(t => t.status === 'COMPLETED').length;
      const failedTasks = agentTasks.filter(t => t.status === 'FAILED').length;
      
      const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
      const errorRate = totalTasks > 0 ? (failedTasks / totalTasks) * 100 : 0;
      
      const completedWithDuration = agentTasks.filter(t => t.status === 'COMPLETED' && t.completedAt && t.createdAt);
      const avgDuration = completedWithDuration.length > 0
        ? completedWithDuration.reduce((acc, t) => acc + (t.completedAt! - t.createdAt), 0) / completedWithDuration.length
        : 0;

      return {
        ...a,
        status: workingAgents.has(a.id) ? 'WORKING' : 'IDLE',
        metrics: {
          completionRate,
          avgDuration,
          errorRate,
          totalTasks
        }
      };
    }));
  }, [tasks]);

  const addLog = async (sender: AgentRole | 'SYSTEM', message: string, type: OperationLog['type'] = 'COMMUNICATION') => {
    if (!currentGoal) return;
    try {
      await addDoc(collection(db, `goals/${currentGoal.id}/logs`), {
        timestamp: Date.now(),
        sender,
        message,
        type
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `goals/${currentGoal.id}/logs`);
    }
  };

  const startBusinessOperation = async () => {
    if (!goalInput.trim() || !user) return;

    setIsPlanning(true);
    const goalId = Math.random().toString(36).substring(7);
    const goalRef = doc(db, 'goals', goalId);
    
    try {
      await setDoc(goalRef, {
        description: goalInput,
        status: 'ACTIVE',
        createdAt: Date.now(),
        createdBy: user.uid,
        kpis: []
      });

      // Need to wait slightly for snapshot to catch the new currentGoal or just use goalId
      await addDoc(collection(db, `goals/${goalId}/logs`), {
        timestamp: Date.now(),
        sender: 'EXECUTIVE',
        message: `Initializing Nexus Strategic Protocol for: "${goalInput}"`,
        type: 'SYSTEM'
      });

      const plannedTasks = await executive.planExecution(goalInput);
      
      // Save all tasks to Firestore
      for (const t of plannedTasks) {
        await setDoc(doc(db, `goals/${goalId}/tasks`, t.id), {
          ...t,
          status: 'PENDING',
          createdAt: Date.now()
        });
      }

      await addDoc(collection(db, `goals/${goalId}/logs`), {
        timestamp: Date.now(),
        sender: 'EXECUTIVE',
        message: `Strategy decomposition complete. ${plannedTasks.length} tasks scheduled across departments.`,
        type: 'ACTION'
      });

      // Execution will be picked up by the automation effect
    } catch (err) {
      console.error(err);
      // Fallback log?
    } finally {
      setIsPlanning(false);
      setGoalInput('');
    }
  };

  // Automation Effect: Monitors tasks and executes them
  useEffect(() => {
    if (!currentGoal || currentGoal.status !== 'ACTIVE') return;

    const executePending = async () => {
      const completedIds = tasks.filter(t => t.status === 'COMPLETED').map(t => t.id);
      const readyTasks = tasks.filter(t => 
        t.status === 'PENDING' && 
        t.dependencies.every(depId => completedIds.includes(depId))
      );

      if (readyTasks.length === 0 && tasks.length > 0 && tasks.every(t => t.status === 'COMPLETED')) {
        await updateDoc(doc(db, 'goals', currentGoal.id), { status: 'ACHIEVED' });
        await addLog('EXECUTIVE', 'All mission-critical objectives achieved. Finalizing reporting.', 'SYSTEM');
        
        // Final KPI refresh
        const result = await executive.analyzePerformance(currentGoal.description, tasks);
        if (result.kpis) {
           await updateDoc(doc(db, 'goals', currentGoal.id), { kpis: result.kpis });
        }
        return;
      }

      for (const task of readyTasks) {
        // Mark as progress
        const taskRef = doc(db, `goals/${currentGoal.id}/tasks`, task.id);
        await updateDoc(taskRef, { status: 'IN_PROGRESS' });
        await addLog(task.assignedTo, `Execution started: ${task.title}`, 'ACTION');

        try {
          const depOutputs = tasks
            .filter(t => task.dependencies.includes(t.id))
            .map(t => `${t.title}: ${t.output}`)
            .join('\n');
          
          const context = depOutputs ? `Outputs from dependent tasks:\n${depOutputs}` : "";
          const output = await executive.executeTask(task.assignedTo, task.description, context);
          await updateDoc(taskRef, { 
            status: 'COMPLETED', 
            output, 
            completedAt: Date.now() 
          });
          await addLog(task.assignedTo, `Task completed: ${output.substring(0, 100)}...`, 'INSIGHT');
          
          // Trigger KPI update periodically
          if (tasks.filter(t => t.status === 'COMPLETED').length % 2 === 0) {
            const result = await executive.analyzePerformance(currentGoal.description, tasks);
            if (result.kpis) {
              await updateDoc(doc(db, 'goals', currentGoal.id), { kpis: result.kpis });
            }
          }
        } catch (err) {
          await updateDoc(taskRef, { status: 'FAILED' });
        }
      }
    };

    executePending();
  }, [tasks, currentGoal?.id]);

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center shadow-2xl"
        >
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-600/20 mx-auto mb-8">
            <Building2 className="text-white w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2 uppercase italic tracking-tight">Nexus Corp Access</h1>
          <p className="text-slate-500 text-sm mb-8 leading-relaxed">
            Authentication required to bridge neural interfaces with the Nexus Autonomous Executive Cluster.
          </p>
          <button 
            onClick={login}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-3 transition-all shadow-lg shadow-indigo-600/20 group"
          >
            <LogIn className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            Initialize Google Auth
          </button>
          <div className="mt-8 pt-8 border-t border-slate-800">
            <p className="text-[10px] text-slate-600 uppercase tracking-[0.2em] font-mono">
              Secured by Antigravity Protocol v4.0
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30 flex flex-col overflow-hidden">
      {/* Top Navigation */}
      <header className="h-20 border-b border-slate-800 bg-slate-900/50 px-8 flex items-center justify-between shrink-0 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Building2 className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white uppercase italic">Executive Core v4.2</h1>
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-mono">Autonomous Enterprise Framework</p>
          </div>
        </div>
        <div className="flex items-center gap-8">
          <div className="text-right">
            <p className="text-[10px] text-slate-500 uppercase font-mono">Current Objective</p>
            <p className="text-sm font-semibold text-indigo-400 max-w-[200px] truncate">
              {currentGoal ? currentGoal.description : 'Awaiting Mission Directive'}
            </p>
          </div>
          <div className="h-10 w-px bg-slate-800" />
          <div className="flex items-center gap-3">
            <div className="text-right mr-4">
               <p className="text-[10px] text-slate-500 uppercase font-mono">Operator</p>
               <p className="text-[11px] font-mono text-white/70">{user.displayName || user.email}</p>
            </div>
            <button onClick={logout} className="p-2 hover:bg-white/5 rounded-lg text-slate-600 hover:text-white transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden p-6 gap-6">
        {/* Left Column - Active Execution Plan (Strategy) */}
        <div className="w-1/3 flex flex-col gap-4 overflow-hidden">
           <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col flex-1 overflow-hidden">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
              Active Execution Plan
            </h2>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6">
              {tasks.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full opacity-20 text-center px-4">
                  <Terminal className="w-10 h-10 mb-4" />
                  <p className="text-[10px] uppercase tracking-[0.2em]">Awaiting high-level strategy decomposition...</p>
                </div>
              )}
              {tasks.map((task, idx) => (
                <div 
                  key={task.id} 
                  className={`border-l-2 pl-5 relative transition-all cursor-pointer group ${
                    task.status === 'COMPLETED' ? 'border-emerald-500 bg-emerald-500/5' : 
                    task.status === 'IN_PROGRESS' ? 'border-indigo-500 bg-indigo-500/5' :
                    'border-slate-800 opacity-60'
                  } py-3 rounded-r-lg`}
                  onClick={() => task.status === 'COMPLETED' && setSelectedTask(task)}
                >
                  <div className={`absolute -left-[5px] top-4 w-2 h-2 rounded-full ${
                    task.status === 'COMPLETED' ? 'bg-emerald-500' : 
                    task.status === 'IN_PROGRESS' ? 'bg-indigo-500' : 'bg-slate-700'
                  }`} />
                  
                  <p className={`text-[9px] font-mono mb-1 uppercase tracking-wider ${
                    task.status === 'COMPLETED' ? 'text-emerald-400' : 
                    task.status === 'IN_PROGRESS' ? 'text-indigo-400' : 'text-slate-500'
                  }`}>
                    STEP 0{idx + 1} — {task.status.replace('_', ' ')}
                  </p>
                  <p className={`text-sm font-medium leading-snug ${
                    task.status === 'COMPLETED' ? 'text-slate-400 line-through' : 'text-white'
                  }`}>
                    {task.title}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-[10px] text-slate-500 italic">
                      Assigned: {task.assignedTo}
                    </p>
                    {task.status === 'COMPLETED' && (
                      <span className="text-[8px] text-indigo-400 font-bold uppercase tracking-tighter">View Output {'>'}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="bg-indigo-600/10 border border-indigo-500/30 rounded-xl p-5 shrink-0">
            <p className="text-xs font-bold text-indigo-300 uppercase tracking-widest mb-2 flex items-center gap-2">
              <Cpu className="w-3 h-3" />
              Executive Insights
            </p>
            <p className="text-xs text-slate-300 leading-relaxed italic">
              "Persistence achieved: All strategic nodes are now synchronizing via cloud-based consensus. Multi-user coordination protocol active."
            </p>
          </div>
        </div>

        {/* Right Column - Coordination & Agents */}
        <div className="flex-1 flex flex-col gap-6 overflow-hidden">
          {/* Top Half: Specialized Agent Grid */}
          <section className="h-[45%] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Autonomous Agent Cluster</h2>
              <div className="flex items-center gap-2">
                 <span className="text-[9px] font-mono text-slate-600">CLUSTER_LOAD: {tasks.filter(t => t.status === 'IN_PROGRESS').length * 10}%</span>
                 <div className="w-20 h-1 bg-slate-800 rounded-full overflow-hidden">
                   <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${tasks.filter(t => t.status === 'IN_PROGRESS').length * 10}%` }} />
                 </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 flex-1 overflow-y-auto custom-scrollbar pr-1 pb-1">
              {agents.map((agent) => (
                <div 
                  key={agent.id}
                  className={`bg-slate-900 border rounded-xl p-4 transition-all hover:bg-slate-800/50 flex flex-col justify-between ${
                    agent.status === 'WORKING' ? 'border-indigo-500/50 ring-1 ring-indigo-500/20 shadow-lg shadow-indigo-500/10' : 'border-slate-800'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-[11px] font-bold text-slate-300 uppercase tracking-tighter truncate w-2/3">{agent.name}</p>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                      agent.status === 'WORKING' ? 'bg-indigo-500 text-white animate-pulse' : 
                      agent.status === 'THINKING' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-500'
                    }`}>
                      {agent.status}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-tight mb-3 line-clamp-2">
                    {agent.description}
                  </p>
                  
                  {agent.metrics && agent.metrics.totalTasks > 0 && (
                    <div className="grid grid-cols-3 gap-2 mb-3 bg-slate-950/50 rounded-lg p-2 border border-slate-800/50">
                      <div className="flex flex-col items-center">
                        <Target className="w-3 h-3 text-indigo-400 mb-0.5" />
                        <span className="text-[8px] font-mono text-slate-400 uppercase">SR</span>
                        <span className="text-[9px] font-bold text-white">{Math.round(agent.metrics.completionRate)}%</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <Clock className="w-3 h-3 text-indigo-400 mb-0.5" />
                        <span className="text-[8px] font-mono text-slate-400 uppercase">AVG</span>
                        <span className="text-[9px] font-bold text-white">{agent.metrics.avgDuration > 1000 ? (agent.metrics.avgDuration / 1000).toFixed(1) + 's' : Math.round(agent.metrics.avgDuration) + 'ms'}</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <AlertTriangle className="w-3 h-3 text-amber-500 mb-0.5" />
                        <span className="text-[8px] font-mono text-slate-400 uppercase">ERR</span>
                        <span className="text-[9px] font-bold text-white">{Math.round(agent.metrics.errorRate)}%</span>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-1 flex-wrap mt-auto">
                    {agent.expertise.slice(0, 2).map(skill => (
                      <span key={skill} className="text-[8px] bg-slate-950 border border-slate-800 px-1.5 py-0.5 rounded uppercase font-mono text-slate-600 truncate max-w-full">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Bottom Half: Main Input & Log */}
          <section className="flex-1 overflow-hidden flex flex-col gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-1 shrink-0">
               <div className="relative">
                <input 
                  type="text" 
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  placeholder="Transmit new business directive to central executive..."
                  className="w-full bg-transparent px-5 py-4 text-white placeholder:text-slate-600 focus:outline-none font-mono text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && startBusinessOperation()}
                />
                <button 
                  onClick={startBusinessOperation}
                  disabled={isPlanning || !goalInput.trim()}
                  className="absolute right-1 top-1 bottom-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:bg-slate-800 px-6 rounded-lg text-white text-xs font-bold uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/20"
                >
                  {isPlanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Execute
                </button>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl flex-1 flex flex-col overflow-hidden relative group">
              <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/30 shrink-0">
                <div className="flex items-center gap-2 font-mono">
                  <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Coordination Mainframe</span>
                </div>
                <div className="flex gap-4">
                  {currentGoal?.kpis?.map((kpi, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[9px] font-mono">
                      <span className="text-slate-600">{kpi.label}:</span>
                      <span className={`font-bold ${kpi.trend === 'up' ? 'text-emerald-400' : 'text-indigo-400'}`}>{kpi.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-5 space-y-4 font-mono text-[10px] custom-scrollbar bg-[radial-gradient(circle_at_50%_50%,rgba(79,70,229,0.03),transparent)]"
              >
                {logs.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center opacity-10">
                    <Cpu className="w-12 h-12 mb-4" />
                    <p className="uppercase tracking-[0.3em] font-bold">Cluster Idling</p>
                  </div>
                )}
                {logs.map((log) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={log.id} 
                    className="flex gap-4"
                  >
                    <div className="w-20 shrink-0 overflow-hidden text-right">
                      <span className="text-slate-700 text-[8px] mr-2">{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    </div>
                    <div className="flex-1 leading-relaxed">
                      <span className={`px-1 rounded-[2px] font-bold uppercase text-[9px] mr-2 ${
                        log.sender === 'EXECUTIVE' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {log.sender}
                      </span>
                      <span className={`text-xs ${
                        log.type === 'SYSTEM' ? 'text-indigo-300 font-bold' : 
                        log.type === 'INSIGHT' ? 'text-blue-300 italic' :
                        log.type === 'ACTION' ? 'text-emerald-400/90' : 'text-slate-400'
                      }`}>
                        {log.message}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
              <div className="absolute bottom-4 right-4 pointer-events-none opacity-5 group-hover:opacity-20 transition-opacity">
                <Building2 className="w-24 h-24 text-indigo-500" />
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Status Bar Footer */}
      <footer className="h-10 bg-indigo-600 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-8">
          <p className="text-[10px] font-bold text-indigo-100 uppercase tracking-widest flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
            System Status: Optimal
          </p>
          <div className="h-4 w-px bg-indigo-400/30" />
          <p className="text-[10px] text-indigo-100 font-mono tracking-tighter">
            LATENCY: 42ms | UPTIME: 99.99% | ACTIVE_AGENTS: {agents.filter(a => a.status === 'WORKING').length} / 10
          </p>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-[10px] text-indigo-100 font-bold uppercase tracking-widest">
            {currentGoal ? `MISSION_ID: ${currentGoal.id.toUpperCase()}` : 'AGENT_COLLECTIVE: READY'}
          </p>
          <div className="h-4 w-px bg-indigo-400/30" />
          <p className="text-[10px] text-indigo-100 font-bold uppercase tracking-widest">Digital Autonomy: ENABLED</p>
        </div>
      </footer>

      {/* Task Result Modal */}
      <AnimatePresence>
        {selectedTask && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl"
            >
              <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-600/10 rounded-lg">
                    <Terminal className="w-4 h-4 text-indigo-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase italic">{selectedTask.title}</h3>
                    <p className="text-[10px] font-mono text-slate-500 uppercase">AGENT: {selectedTask.assignedTo}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedTask(null)}
                  className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-500 hover:text-white"
                >
                  <ChevronRight className="w-4 h-4 rotate-90" />
                </button>
              </div>
              <div className="p-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
                <div className="prose prose-invert prose-sm">
                  <p className="text-slate-200 leading-relaxed font-mono text-xs whitespace-pre-wrap">
                    {selectedTask.output}
                  </p>
                </div>
              </div>
              <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex justify-end">
                <button 
                  onClick={() => setSelectedTask(null)}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold uppercase tracking-widest text-white transition-all shadow-lg shadow-indigo-600/10"
                >
                  Dismiss Report
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }
      `}</style>
    </div>
  );
}


