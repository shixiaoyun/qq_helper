import type { Response } from 'express';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export function success<T>(res: Response, data: T, message?: string, statusCode = 200) {
  const response: ApiResponse<T> = {
    success: true,
    data,
  };
  if (message) response.message = message;
  res.status(statusCode).json(response);
}

export function error(res: Response, message: string, statusCode = 400) {
  const response: ApiResponse = {
    success: false,
    error: message,
  };
  res.status(statusCode).json(response);
}

export function paginated<T>(
  res: Response,
  data: T[],
  page: number,
  pageSize: number,
  total: number,
  message?: string
) {
  const totalPages = Math.ceil(total / pageSize);
  const response: ApiResponse<T[]> = {
    success: true,
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
  };
  if (message) response.message = message;
  res.status(200).json(response);
}
