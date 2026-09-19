interface RegisteredRequest {
  batchId: string;
  controller: AbortController;
}

const taskRequests = new Map<string, Map<string, RegisteredRequest>>();
const cancelledTaskIds = new Set<string>();
const MAX_CANCELLED_TASK_IDS = 100;

export function registerTranslationRequest(
  taskId: string,
  batchId: string,
): AbortController {
  const controller = new AbortController();
  if (cancelledTaskIds.has(taskId)) {
    controller.abort();
    return controller;
  }
  const requests = taskRequests.get(taskId) ?? new Map();
  requests.set(batchId, { batchId, controller });
  taskRequests.set(taskId, requests);
  return controller;
}

export function releaseTranslationRequest(
  taskId: string,
  batchId: string,
): void {
  const requests = taskRequests.get(taskId);
  if (!requests) {
    return;
  }

  requests.delete(batchId);
  if (requests.size === 0) {
    taskRequests.delete(taskId);
  }
}

export function cancelTranslationTask(taskId: string): number {
  cancelledTaskIds.add(taskId);
  if (cancelledTaskIds.size > MAX_CANCELLED_TASK_IDS) {
    const oldestTaskId = cancelledTaskIds.values().next().value;
    if (typeof oldestTaskId === 'string') {
      cancelledTaskIds.delete(oldestTaskId);
    }
  }
  const requests = taskRequests.get(taskId);
  if (!requests) {
    return 0;
  }

  taskRequests.delete(taskId);
  for (const request of requests.values()) {
    request.controller.abort();
  }
  return requests.size;
}

export function isTranslationTaskCancelled(taskId: string): boolean {
  return cancelledTaskIds.has(taskId);
}

export function getActiveRequestCount(taskId?: string): number {
  if (taskId !== undefined) {
    return taskRequests.get(taskId)?.size ?? 0;
  }
  return Array.from(taskRequests.values()).reduce(
    (total, requests) => total + requests.size,
    0,
  );
}
