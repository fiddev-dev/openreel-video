import { create } from "zustand";

export type BackgroundTaskStatus = "running" | "completed" | "failed" | "cancelled";

export interface BackgroundTask {
  id: string;
  name: string;
  description: string;
  progress: number;
  message: string;
  status: BackgroundTaskStatus;
  startedAt: number;
  completedAt?: number;
  /** Call this to cancel the task */
  cancel?: () => void;
}

interface BackgroundTaskState {
  tasks: BackgroundTask[];
  addTask: (task: Omit<BackgroundTask, "startedAt" | "status">) => string;
  updateTask: (id: string, updates: Partial<Pick<BackgroundTask, "progress" | "message" | "status" | "completedAt">>) => void;
  completeTask: (id: string) => void;
  failTask: (id: string, message: string) => void;
  cancelTask: (id: string) => void;
  removeTask: (id: string) => void;
  clearCompleted: () => void;
  isTaskRunning: (id: string) => boolean;
}

let taskIdCounter = 0;

export const useBackgroundTaskStore = create<BackgroundTaskState>((set, get) => ({
  tasks: [],

  addTask: (task) => {
    const id = task.id || `bg-task-${++taskIdCounter}`;
    const newTask: BackgroundTask = {
      ...task,
      id,
      status: "running",
      startedAt: Date.now(),
    };
    set((state) => ({ tasks: [...state.tasks, newTask] }));
    return id;
  },

  updateTask: (id, updates) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, ...updates } : t,
      ),
    }));
  },

  completeTask: (id) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id
          ? { ...t, status: "completed", progress: 100, completedAt: Date.now() }
          : t,
      ),
    }));
    // Auto-remove completed tasks after 8 seconds
    setTimeout(() => {
      get().removeTask(id);
    }, 8000);
  },

  failTask: (id, message) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id
          ? { ...t, status: "failed", message, completedAt: Date.now() }
          : t,
      ),
    }));
    // Auto-remove failed tasks after 12 seconds
    setTimeout(() => {
      get().removeTask(id);
    }, 12000);
  },

  cancelTask: (id) => {
    const task = get().tasks.find((t) => t.id === id);
    if (task?.cancel) {
      task.cancel();
    }
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id
          ? { ...t, status: "cancelled", completedAt: Date.now() }
          : t,
      ),
    }));
    setTimeout(() => {
      get().removeTask(id);
    }, 4000);
  },

  removeTask: (id) => {
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }));
  },

  clearCompleted: () => {
    set((state) => ({
      tasks: state.tasks.filter((t) => t.status === "running"),
    }));
  },

  isTaskRunning: (id) => {
    const task = get().tasks.find((t) => t.id === id);
    return task?.status === "running";
  },
}));
