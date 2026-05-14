import { prisma } from '../config/prisma.js';

export const prismaService = {
  // User operations
  user: {
    create: (data: any) => prisma.user.create({ data }),
    findById: (id: number) => prisma.user.findUnique({ where: { id } }),
    findByUsername: (username: string) => prisma.user.findUnique({ where: { username } }),
    findByEmail: (email: string) => prisma.user.findUnique({ where: { email } }),
    update: (id: number, data: any) => prisma.user.update({ where: { id }, data }),
    delete: (id: number) => prisma.user.delete({ where: { id } }),
    list: (skip = 0, take = 50) => prisma.user.findMany({ skip, take, orderBy: { createdAt: 'desc' } }),
    count: () => prisma.user.count(),
  },

  // Conversation operations
  conversation: {
    create: (data: any) => prisma.conversation.create({ data }),
    findById: (id: number) => prisma.conversation.findUnique({ where: { id } }),
    findByUser: (userId: number, skip = 0, take = 50) =>
      prisma.conversation.findMany({ where: { userId }, skip, take, orderBy: { updatedAt: 'desc' } }),
    update: (id: number, data: any) => prisma.conversation.update({ where: { id }, data }),
    delete: (id: number) => prisma.conversation.delete({ where: { id } }),
    countByUser: (userId: number) => prisma.conversation.count({ where: { userId } }),
  },

  // Message operations
  message: {
    create: (data: any) => prisma.message.create({ data }),
    findByConversation: (conversationId: number, skip = 0, take = 100) =>
      prisma.message.findMany({ where: { conversationId }, skip, take, orderBy: { createdAt: 'asc' } }),
    deleteByConversation: (conversationId: number) =>
      prisma.message.deleteMany({ where: { conversationId } }),
  },

  // AI Provider operations
  aiProvider: {
    create: (data: any) => prisma.aIProvider.create({ data }),
    findById: (id: number) => prisma.aIProvider.findUnique({ where: { id } }),
    findActive: () => prisma.aIProvider.findMany({ where: { isActive: 1 } }),
    findDefault: () => prisma.aIProvider.findFirst({ where: { isDefault: 1, isActive: 1 } }),
    update: (id: number, data: any) => prisma.aIProvider.update({ where: { id }, data }),
    delete: (id: number) => prisma.aIProvider.delete({ where: { id } }),
  },

  // Knowledge Base operations
  knowledgeBase: {
    create: (data: any) => prisma.knowledgeBase.create({ data }),
    findById: (id: number) => prisma.knowledgeBase.findUnique({ where: { id }, include: { documents: true } }),
    findByUser: (userId: number) => prisma.knowledgeBase.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } }),
    update: (id: number, data: any) => prisma.knowledgeBase.update({ where: { id }, data }),
    delete: (id: number) => prisma.knowledgeBase.delete({ where: { id } }),
  },

  // Document operations
  document: {
    create: (data: any) => prisma.document.create({ data }),
    findById: (id: number) => prisma.document.findUnique({ where: { id }, include: { chunks: true } }),
    findByKnowledgeBase: (knowledgeBaseId: number) =>
      prisma.document.findMany({ where: { knowledgeBaseId }, orderBy: { createdAt: 'desc' } }),
    update: (id: number, data: any) => prisma.document.update({ where: { id }, data }),
    delete: (id: number) => prisma.document.delete({ where: { id } }),
  },

  // Document Chunk operations
  documentChunk: {
    create: (data: any) => prisma.documentChunk.create({ data }),
    createMany: (data: any[]) => prisma.documentChunk.createMany({ data }),
    findByKnowledgeBase: (knowledgeBaseId: number) =>
      prisma.documentChunk.findMany({ where: { knowledgeBaseId } }),
    findByDocument: (documentId: number) =>
      prisma.documentChunk.findMany({ where: { documentId } }),
    deleteByDocument: (documentId: number) => prisma.documentChunk.deleteMany({ where: { documentId } }),
    deleteByKnowledgeBase: (knowledgeBaseId: number) => prisma.documentChunk.deleteMany({ where: { knowledgeBaseId } }),
  },

  // Workflow operations
  workflow: {
    create: (data: any) => prisma.workflow.create({ data }),
    findById: (id: number) => prisma.workflow.findUnique({ where: { id } }),
    findByUser: (userId: number) => prisma.workflow.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } }),
    update: (id: number, data: any) => prisma.workflow.update({ where: { id }, data }),
    delete: (id: number) => prisma.workflow.delete({ where: { id } }),
  },

  // Workflow Run operations
  workflowRun: {
    create: (data: any) => prisma.workflowRun.create({ data }),
    findById: (id: number) => prisma.workflowRun.findUnique({ where: { id } }),
    findByWorkflow: (workflowId: number) =>
      prisma.workflowRun.findMany({ where: { workflowId }, orderBy: { createdAt: 'desc' } }),
    update: (id: number, data: any) => prisma.workflowRun.update({ where: { id }, data }),
  },

  // Agent operations
  agent: {
    create: (data: any) => prisma.agent.create({ data }),
    findById: (id: number) => prisma.agent.findUnique({ where: { id } }),
    findByUser: (userId: number) => prisma.agent.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } }),
    update: (id: number, data: any) => prisma.agent.update({ where: { id }, data }),
    delete: (id: number) => prisma.agent.delete({ where: { id } }),
  },

  // Crew operations
  crew: {
    create: (data: any) => prisma.crew.create({ data }),
    findById: (id: number) => prisma.crew.findUnique({ where: { id }, include: { members: { include: { agent: true } } } }),
    findByUser: (userId: number) => prisma.crew.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } }),
    update: (id: number, data: any) => prisma.crew.update({ where: { id }, data }),
    delete: (id: number) => prisma.crew.delete({ where: { id } }),
  },

  // Crew Member operations
  crewMember: {
    create: (data: any) => prisma.crewMember.create({ data }),
    findByCrew: (crewId: number) => prisma.crewMember.findMany({ where: { crewId }, include: { agent: true }, orderBy: { order: 'asc' } }),
    deleteByCrew: (crewId: number) => prisma.crewMember.deleteMany({ where: { crewId } }),
  },

  // Agent Run operations
  agentRun: {
    create: (data: any) => prisma.agentRun.create({ data }),
    findById: (id: number) => prisma.agentRun.findUnique({ where: { id } }),
    findByCrew: (crewId: number) => prisma.agentRun.findMany({ where: { crewId }, orderBy: { createdAt: 'desc' } }),
    update: (id: number, data: any) => prisma.agentRun.update({ where: { id }, data }),
  },
};
