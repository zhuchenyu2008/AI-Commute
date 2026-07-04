import { prisma } from "@/lib/db";

export class MemoryCandidateNotFoundError extends Error {
  constructor() {
    super("未找到记忆候选");
    this.name = "MemoryCandidateNotFoundError";
  }
}

export class MemoryCandidateAlreadyHandledError extends Error {
  constructor() {
    super("记忆候选已处理");
    this.name = "MemoryCandidateAlreadyHandledError";
  }
}

export class MemoryNotFoundError extends Error {
  constructor() {
    super("未找到记忆");
    this.name = "MemoryNotFoundError";
  }
}

export async function confirmMemoryCandidate(input: {
  candidateId: string;
  userId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.memoryCandidate.updateMany({
      where: {
        id: input.candidateId,
        userId: input.userId,
        status: "pending",
      },
      data: { status: "confirmed" },
    });

    if (claimed.count !== 1) {
      const existing = await tx.memoryCandidate.findFirst({
        where: { id: input.candidateId, userId: input.userId },
      });

      if (!existing) {
        throw new MemoryCandidateNotFoundError();
      }

      throw new MemoryCandidateAlreadyHandledError();
    }

    const candidate = await tx.memoryCandidate.findFirstOrThrow({
      where: { id: input.candidateId, userId: input.userId },
    });

    await tx.memory.create({
      data: {
        userId: candidate.userId,
        kind: candidate.kind,
        label: candidate.label,
        valueJson: candidate.valueJson,
      },
    });

    return { status: "confirmed" };
  });
}

export async function ignoreMemoryCandidate(input: {
  candidateId: string;
  userId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.memoryCandidate.updateMany({
      where: {
        id: input.candidateId,
        userId: input.userId,
        status: "pending",
      },
      data: { status: "ignored" },
    });

    if (claimed.count !== 1) {
      const existing = await tx.memoryCandidate.findFirst({
        where: { id: input.candidateId, userId: input.userId },
      });

      if (!existing) {
        throw new MemoryCandidateNotFoundError();
      }

      throw new MemoryCandidateAlreadyHandledError();
    }

    return { status: "ignored" };
  });
}

export async function deleteMemory(input: { memoryId: string; userId: string }) {
  const deleted = await prisma.memory.deleteMany({
    where: { id: input.memoryId, userId: input.userId },
  });

  if (deleted.count !== 1) {
    throw new MemoryNotFoundError();
  }

  return { status: "deleted" };
}

export async function deleteMemoryCandidate(input: {
  candidateId: string;
  userId: string;
}) {
  const deleted = await prisma.memoryCandidate.deleteMany({
    where: { id: input.candidateId, userId: input.userId },
  });

  if (deleted.count !== 1) {
    throw new MemoryCandidateNotFoundError();
  }

  return { status: "deleted" };
}
