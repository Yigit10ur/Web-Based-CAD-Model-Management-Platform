import { NextResponse } from 'next/server';

import { deleteModel } from '@/lib/models';
import { currentUser, deletableModel, readableModel } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const { id } = await params;
  const model = await readableModel(id, user.id);

  // Not found rather than forbidden: confirming that a model exists but
  // belongs to someone else is more than the caller needs to know.
  if (!model) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return NextResponse.json({ model });
}

/**
 * Delete a model, every revision of it, and its files.
 *
 * There is no undo and nothing is kept: a model that is deleted is gone, which
 * is what the word has to mean for anyone to trust it. The confirmation is the
 * caller's job.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 });

  const { id } = await params;

  // Two different answers on purpose. Someone who cannot even see this model
  // gets the 404 a guessed uuid would get; someone who is looking at it in
  // their catalogue is told plainly why they may not delete it, which tells
  // them nothing they could not already see.
  if (!(await readableModel(id, user.id))) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  if (!(await deletableModel(id, user.id))) {
    return NextResponse.json(
      { error: 'only the project owner, or whoever uploaded this model, can delete it' },
      { status: 403 },
    );
  }

  try {
    const removed = await deleteModel(id);
    return NextResponse.json({ deleted: id, ...removed });
  } catch (cause) {
    // Nothing was removed from the database, because the files come first.
    // Saying so matters: "delete failed" that had already half-happened would
    // be worse than useless.
    console.error(`deleting model ${id}`, cause);
    return NextResponse.json(
      { error: 'the files could not be deleted, so nothing was removed — try again' },
      { status: 502 },
    );
  }
}
