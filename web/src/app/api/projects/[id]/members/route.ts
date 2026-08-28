import { NextResponse } from 'next/server';
import { z } from 'zod';

import { addMember, cancelInvitation, membersOf, removeMember } from '@/lib/projects';
import { currentUser, ownedProject, readableProject } from '@/lib/session';

export const dynamic = 'force-dynamic';

const addSchema = z.object({
  email: z.string().email(),
  role: z.enum(['owner', 'editor', 'viewer']).default('viewer'),
});

const unauthorized = () => NextResponse.json({ error: 'not signed in' }, { status: 401 });
const notFound = () => NextResponse.json({ error: 'not found' }, { status: 404 });

type Params = { params: Promise<{ id: string }> };

/**
 * Who is in this project.
 *
 * Readable by anyone who can read the project: knowing who else can open your
 * files is not privileged information, it is the point of sharing them.
 */
export async function GET(_request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const { id } = await params;
  if (!(await readableProject(id, user.id))) return notFound();

  return NextResponse.json(await membersOf(id));
}

export async function POST(request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const { id } = await params;
  // Only an owner hands out access. A project id in a URL is not a permission,
  // and neither is being able to add models to it.
  const project = await ownedProject(id, user.id);
  if (!project) return notFound();

  const body = addSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: 'a valid email is required' }, { status: 400 });
  }

  const result = await addMember(id, body.data.email, body.data.role, user.id);
  return NextResponse.json(result, { status: 201 });
}

/**
 * Take access away, by `userId` for someone who has an account or by `email`
 * for an invitation that is still waiting.
 */
export async function DELETE(request: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const project = await ownedProject(id, user.id);
  if (!project) return notFound();

  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const email = url.searchParams.get('email');

  if (userId) {
    // The owner is not a member who can be removed: the project would still be
    // theirs, and the list would stop saying so.
    if (userId === project.ownerId) {
      return NextResponse.json({ error: 'the owner cannot be removed' }, { status: 400 });
    }
    await removeMember(id, userId);
    return NextResponse.json({ removed: userId });
  }

  if (email) {
    await cancelInvitation(id, email);
    return NextResponse.json({ removed: email });
  }

  return NextResponse.json({ error: 'userId or email is required' }, { status: 400 });
}
