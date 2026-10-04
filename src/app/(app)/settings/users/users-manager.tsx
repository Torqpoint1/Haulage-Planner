"use client";

import { Check, Copy, MailPlus, Trash2, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Chip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { DataTable, type Column } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { Truncate } from "@/components/ui/truncate";
import { ROLES, ROLE_INFO, type Role } from "@/lib/auth/roles";
import { formatDate } from "@/lib/format";
import { changeRole, inviteMember, removeMember, revokeInvitation } from "./actions";

export type Member = {
  id: string;
  userId: string;
  role: Role;
  name: string;
  email: string;
  joinedAt: string;
};

export type Invitation = { id: string; email: string; role: Role; expiresAt: string };

const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: ROLE_INFO[r].label }));

export function UsersManager({
  members,
  invitations,
  currentUserId,
}: {
  members: Member[];
  invitations: Invitation[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [newLink, setNewLink] = useState<InviteLink | null>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong. Try again.");
      }
    });
  }

  const roleSelect = (m: Member, className?: string) => (
    <Select
      aria-label={`Role for ${m.name}`}
      options={ROLE_OPTIONS}
      value={m.role}
      disabled={pending}
      onValueChange={(role) =>
        run(
          () => changeRole({ membershipId: m.id, role }),
          `${m.name} is now ${ROLE_INFO[role as Role].label}.`,
        )
      }
      className={className}
    />
  );

  const removeButton = (m: Member) =>
    m.userId === currentUserId ? null : (
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        aria-label={`Remove ${m.name}`}
        onClick={() => setRemoving(m)}
        disabled={pending}
      >
        <Trash2 aria-hidden />
      </Button>
    );

  const newLinkFor = (i: Invitation) =>
    startTransition(async () => {
      const result = await inviteMember({ email: i.email, role: i.role });
      if (result.ok) {
        setNewLink({ email: i.email, link: result.link, emailed: result.emailed });
        router.refresh();
      } else toast.error(result.error);
    });

  const inviteActions = (i: Invitation) => (
    <span className="inline-flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => newLinkFor(i)}>
        New link
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => run(() => revokeInvitation(i.id), `Invitation for ${i.email} cancelled.`)}
      >
        Cancel
      </Button>
    </span>
  );

  const memberColumns: Column<Member>[] = [
    {
      id: "name",
      header: "Name",
      hideable: false,
      sortValue: (m) => m.name,
      cell: (m) => (
        <span className="flex min-w-0 items-center gap-3">
          <Avatar name={m.name} size="sm" />
          <Truncate className="font-medium">{m.name}</Truncate>
          {m.userId === currentUserId ? <Chip>You</Chip> : null}
        </span>
      ),
    },
    {
      id: "email",
      header: "Email",
      sortValue: (m) => m.email,
      cell: (m) => <Truncate>{m.email}</Truncate>,
    },
    {
      id: "role",
      header: "Role",
      hideable: false,
      sortValue: (m) => ROLES.indexOf(m.role),
      cell: (m) => roleSelect(m, "w-menu"),
    },
    {
      id: "joined",
      header: "Joined",
      align: "right",
      sortValue: (m) => m.joinedAt,
      cell: (m) => formatDate(m.joinedAt),
    },
    {
      id: "actions",
      header: "Actions",
      hideable: false,
      align: "right",
      cell: (m) => removeButton(m),
    },
  ];

  const inviteColumns: Column<Invitation>[] = [
    { id: "email", header: "Email", hideable: false, cell: (i) => <Truncate>{i.email}</Truncate> },
    { id: "role", header: "Role", cell: (i) => ROLE_INFO[i.role].label },
    { id: "expires", header: "Expires", align: "right", cell: (i) => formatDate(i.expiresAt) },
    {
      id: "actions",
      header: "Actions",
      align: "right",
      hideable: false,
      cell: (i) => inviteActions(i),
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="members-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 id="members-heading" className="text-base font-semibold">
            Members <span className="num font-normal text-text-subtle">({members.length})</span>
          </h2>
          <Button variant="primary" onClick={() => setInviteOpen(true)}>
            <UserPlus aria-hidden />
            Invite someone
          </Button>
        </div>
        {/* Phones and tablets: a stacked list keeps the role picker in view. */}
        <ul
          aria-label="Members"
          className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface xl:hidden"
        >
          {[...members]
            .sort((a, b) => a.name.localeCompare(b.name, "en-GB"))
            .map((m) => (
              <li key={m.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={m.name} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="flex min-w-0 items-center gap-2">
                      <Truncate className="text-sm font-medium">{m.name}</Truncate>
                      {m.userId === currentUserId ? <Chip>You</Chip> : null}
                    </span>
                    <Truncate className="text-sm text-text-muted">{m.email}</Truncate>
                  </div>
                  <span className="md:hidden">{removeButton(m)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {roleSelect(m, "md:w-menu")}
                  <span className="hidden w-control-sm shrink-0 md:block">{removeButton(m)}</span>
                </div>
              </li>
            ))}
        </ul>
        <DataTable
          label="Members"
          columns={memberColumns}
          rows={members}
          getRowId={(m) => m.id}
          initialSort={{ columnId: "name", direction: "asc" }}
          className="hidden xl:flex"
        />
      </section>

      <section aria-labelledby="invitations-heading" className="flex flex-col gap-3">
        <h2 id="invitations-heading" className="text-base font-semibold">
          Pending invitations
        </h2>
        {invitations.length === 0 ? (
          <Card className="xl:hidden">
            <EmptyState
              compact
              icon={MailPlus}
              title="No pending invitations"
              description="People you invite appear here until they accept."
            />
          </Card>
        ) : (
          <ul
            aria-label="Pending invitations"
            className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface xl:hidden"
          >
            {invitations.map((i) => (
              <li key={i.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                <div className="flex min-w-0 flex-1 flex-col">
                  <Truncate className="text-sm font-medium">{i.email}</Truncate>
                  <span className="text-sm text-text-muted">
                    {ROLE_INFO[i.role].label} · expires{" "}
                    <span className="num">{formatDate(i.expiresAt)}</span>
                  </span>
                </div>
                {inviteActions(i)}
              </li>
            ))}
          </ul>
        )}
        <DataTable
          label="Pending invitations"
          columns={inviteColumns}
          rows={invitations}
          getRowId={(i) => i.id}
          className="hidden xl:flex"
          empty={
            <EmptyState
              compact
              icon={MailPlus}
              title="No pending invitations"
              description="People you invite appear here until they accept."
            />
          }
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-icon-sm text-text-subtle" aria-hidden />
            What each role can do
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 md:grid-cols-2">
            {ROLES.map((role) => (
              <div key={role} className="flex min-w-0 flex-col gap-1">
                <dt className="text-sm font-semibold">
                  {ROLE_INFO[role].label}{" "}
                  <span className="font-normal text-text-subtle">· {ROLE_INFO[role].who}</span>
                </dt>
                <dd className="text-sm text-text-muted">{ROLE_INFO[role].description}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <InviteModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={(value) => {
          setInviteOpen(false);
          setNewLink(value);
          router.refresh();
        }}
      />

      <InviteLinkModal value={newLink} onClose={() => setNewLink(null)} />

      <Modal
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={removing ? `Remove ${removing.name}?` : "Remove member"}
        description="They will lose access straight away. Their past work stays in the history."
        footer={
          <>
            <Button onClick={() => setRemoving(null)}>Keep</Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() => {
                const member = removing;
                if (!member) return;
                setRemoving(null);
                run(() => removeMember(member.id), `${member.name} has been removed.`);
              }}
            >
              Remove
            </Button>
          </>
        }
      />
    </div>
  );
}

function InviteModal({
  open,
  onOpenChange,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: (value: InviteLink) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("planner");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setEmail("");
    setRole("planner");
    setErrors({});
    setFormError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await inviteMember({ email, role });
      if (result.ok) {
        onInvited({
          email: email.trim().toLowerCase(),
          link: result.link,
          emailed: result.emailed,
        });
        reset();
      } else {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.fieldErrors ? null : result.error);
      }
    });
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
      title="Invite someone"
      description="They'll get a link to create their account and join your company."
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {formError ? (
          <p
            role="alert"
            className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg"
          >
            {formError}
          </p>
        ) : null}
        <Field label="Email" error={errors.email}>
          <Input
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Role" hint={ROLE_INFO[role].description} error={errors.role}>
          <Select options={ROLE_OPTIONS} value={role} onValueChange={(v) => setRole(v as Role)} />
        </Field>
        <div className="flex flex-col-reverse gap-2 pt-2 md:flex-row md:justify-end">
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" loading={pending}>
            Create invitation
          </Button>
        </div>
      </form>
    </Modal>
  );
}

type InviteLink = { email: string; link: string; emailed: boolean };

function InviteLinkModal({ value, onClose }: { value: InviteLink | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal
      open={value !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false);
          onClose();
        }
      }}
      title={value?.emailed ? "Invitation sent" : "Invitation ready"}
      description={
        value
          ? value.emailed
            ? `We've emailed ${value.email} an invitation. It works once and expires in 14 days. You can also send them this link yourself.`
            : `Send this link to ${value.email}. It works once and expires in 14 days.`
          : undefined
      }
      footer={<Button onClick={onClose}>Done</Button>}
    >
      {value ? (
        <div className="flex flex-col gap-3">
          <div className="flex min-w-0 gap-2">
            <Input
              readOnly
              value={value.link}
              aria-label="Invitation link"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              variant="primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(value.link);
                  setCopied(true);
                } catch {
                  toast.info("Select the link and copy it with Ctrl+C or Cmd+C.");
                }
              }}
            >
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-sm text-text-subtle">
            For security we only show this link once. If it gets lost, create a new link from the
            pending invitations list.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
