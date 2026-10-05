import { NextResponse } from 'next/server';
export function GET(){return NextResponse.json({error:'Use POST /api/runs to create durable local research.'},{status:410});}
export const POST=GET;
