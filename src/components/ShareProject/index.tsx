import { Button, Checkbox, Form, Modal, Select, Skeleton } from "antd";
import TextArea from "antd/es/input/TextArea";
import { useEffect, useState } from "react";
import {
  useFetchSharedPermission,
  useFetchUserPermission,
  useUpdateProjectVisibility,
  useUpdateProjectGroup,
  useUpdateUserPermission,
  useRemoveUserAccess,
  useInviteUsers,
} from "./api";
import { getGroups, Group } from "@/api/groups/client";
import { getWorkspaceMembers, WorkspaceMember } from "@/api/workspaces/client";
import {
  API_AVATAR,
  ProjectInvitePermission,
  ProjectPermission,
  ProjectVisible,
  RESTRICTED,
} from "@/utils/constants";
import { IUserSharedProject } from "@/types/projects.type";
import { notificationProvider } from "@/providers/notification";
import { BadgeCheck } from "lucide-react";
import Image from "next/image";
const { Option } = Select;

interface shareProjectProps {
  projectId: string | undefined;
  projectName: string | undefined;
  openShareProject: boolean;
  setOpenShareProject: (open: boolean) => void;
}

export default function ShareProject(props: shareProjectProps) {
  const { projectId, projectName, openShareProject, setOpenShareProject } =
    props;
  const [formShare] = Form.useForm();
  const [emails, setEmails] = useState<string[]>([]);
  const [permission, setPermission] = useState<string>(
    ProjectPermission.VIEWER,
  );
  const [message, setMessage] = useState<string>("");
  const [sendInvite, setSendInvite] = useState<boolean>(true);
  const {
    data: sharedPermissionData,
    isLoading: isLoadingSharedPermission,
    refetch: refetchSharedPermission,
  } = useFetchSharedPermission(projectId || "");
  const { data: userPermissionData, refetch: refetchUserPermission } =
    useFetchUserPermission(projectId || "");

  const { updateVisibility, isLoading: isLoadingVisibility } =
    useUpdateProjectVisibility();
  const { updateGroup, isLoading: isLoadingGroup } = useUpdateProjectGroup();
  const { updateUserPermission, isLoading: isLoadingUserPerm } =
    useUpdateUserPermission();
  const { removeAccess, isLoading: isLoadingRemove } = useRemoveUserAccess();
  const { invite, isLoading: isLoadingInvite } = useInviteUsers();
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);

  const isUpdating =
    isLoadingVisibility || isLoadingUserPerm || isLoadingRemove || isLoadingInvite;

  const currentUserCanEdit = userPermissionData?.canManage ?? false;
  const isTeamProject = sharedPermissionData?.workspace_type === "team";

  useEffect(() => {
    if (openShareProject) {
      refetchSharedPermission();
      refetchUserPermission();
    }
  }, [openShareProject, refetchSharedPermission, refetchUserPermission]);

  useEffect(() => {
    if (!openShareProject || !isTeamProject || !sharedPermissionData?.workspace_id) {
      return;
    }
    const workspaceId = sharedPermissionData.workspace_id;
    setIsLoadingGroups(true);
    Promise.all([getGroups(workspaceId), getWorkspaceMembers(workspaceId)])
      .then(([groupData, memberData]) => {
        setGroups(groupData);
        setWorkspaceMembers(memberData);
      })
      .catch(() => {
        setGroups([]);
        setWorkspaceMembers([]);
      })
      .finally(() => setIsLoadingGroups(false));
  }, [openShareProject, isTeamProject, sharedPermissionData?.workspace_id]);

  const activeWorkspaceMembers = workspaceMembers.filter(
    (member) => member.status === "active",
  );
  const selectedGroup = groups.find(
    (group) => group.id === sharedPermissionData?.group_id,
  );
  const peopleWithAccess = selectedGroup
    ? activeWorkspaceMembers.filter(
        (member) =>
          member.role === "owner" ||
          member.role === "admin" ||
          selectedGroup.members.some((groupMember) => groupMember.userId === member.userId),
      )
    : activeWorkspaceMembers;

  const handleUpdateProjectGroup = async (groupId: string | null) => {
    if (!projectId) return;
    await updateGroup({ projectId, groupId });
    refetchSharedPermission();
  };

  const handleEmailChange = (values: string[]) => {
    const invalid = values.filter((email) => !isValidEmail(email));
    const isDuplicate = values.filter(
      (email, index) => values.indexOf(email) !== index,
    );
    if (invalid.length > 0 || isDuplicate.length > 0) {
      return;
    }
    setEmails(values);
  };

  const isValidEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleCancel = () => {
    formShare.resetFields();
    setEmails([]);
    setPermission(ProjectPermission.VIEWER);
    setMessage("");
    setOpenShareProject(false);
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(
      `${window.location.origin}/projects/${projectId}`,
    );
    notificationProvider.open({
      type: "progress",
      placement: "bottomRight",
      message: "Copy link to clipboard successfully",
    });
  };

  const handleUpdateProjectPermission = async (projectMode: ProjectVisible) => {
    if (!projectId) return;
    await updateVisibility({ projectId, projectMode });
    refetchSharedPermission();
  };

  const handleUpdateUserPermission = async (
    email: string,
    newPermission: string,
  ) => {
    if (!projectId) return;

    if (newPermission === RESTRICTED) {
      await removeAccess({ projectId, email });
    } else {
      // For updating permission, we still need userId
      // Find userId from the user list
      const user = sharedPermissionData?.list_users.find(
        (u) => u.email === email,
      );
      if (!user) return;
      
      await updateUserPermission({
        projectId,
        targetUserId: user.userId,
        permission: newPermission,
      });
    }
    refetchSharedPermission();
  };

  const handleSentInvite = async () => {
    if (!projectId) return;

    const addUserAccess = emails.map((email) => ({
      email,
      invite_permission: permission,
    }));

    await invite({
      projectId,
      sendEmail: sendInvite,
      message: message || undefined,
      users: addUserAccess,
    });

    refetchSharedPermission();
    setEmails([]);
    setMessage("");
    setSendInvite(true);
  };

  // Team-workspace projects don't use per-user invites/visibility — access is
  // decided by workspace role + Group (see docs-v2/project-group-sharing-plan.md).
  // Only surface a Group picker instead of the Personal-workspace invite UI.
  if (isTeamProject) {
    return (
      <Modal
        title={
          <div className="overflow-hidden text-ellipsis whitespace-nowrap pr-4">
            Share {projectName}
          </div>
        }
        open={openShareProject}
        onCancel={handleCancel}
        footer={null}
        width={550}
        zIndex={2000}
      >
        <div className="loading-bar" hidden={!isLoadingGroup} />
        <div className="pt-2">
          <div className="font-semibold pb-2">Who can see this project</div>
          {isLoadingSharedPermission || isLoadingGroups ? (
            <Skeleton.Input active block size="large" className="mt-4 !h-10 !w-full" />
          ) : (
            <Select
              className="mt-4 h-10! w-full"
              value={sharedPermissionData?.group_id ?? undefined}
              placeholder="Whole team (no group)"
              allowClear
              disabled={!currentUserCanEdit || isLoadingGroup}
              options={groups.map((group) => ({
                value: group.id,
                label: group.name,
              }))}
              onChange={(groupId) =>
                void handleUpdateProjectGroup(groupId ?? null)
              }
            />
          )}

          <div className="mt-6 font-semibold">
            People with access ({peopleWithAccess.length})
          </div>
          {selectedGroup && (
            <p className="mt-1 text-xs text-gray-500">
              Members of &quot;{selectedGroup.name}&quot;, plus workspace Owner/Admin.
            </p>
          )}
          <div className="mt-2 flex max-h-64 flex-col gap-4 overflow-y-auto py-2">
            {isLoadingSharedPermission || isLoadingGroups ? (
              <Skeleton />
            ) : peopleWithAccess.length === 0 ? (
              <div className="text-sm text-gray-500">No one else has access yet.</div>
            ) : (
              peopleWithAccess.map((member) => (
                <div
                  key={member.userId}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8">
                      <Image
                        src={member.avatar}
                        alt="avatar"
                        width={32}
                        height={32}
                        className="h-8 w-8 rounded-full object-cover"
                        unoptimized
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
                        {member.fullName}
                        {member.userId === userPermissionData?.userId && (
                          <span> (You) </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600">{member.email}</div>
                    </div>
                  </div>
                  <span className="text-xs capitalize text-gray-500">
                    {member.role}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="flex w-full gap-2 pt-6">
          <Button
            type="default"
            className="w-1/2 h-10!"
            onClick={handleCopyLink}
          >
            Copy Link
          </Button>
          <Button
            type="primary"
            className="w-1/2 h-10!"
            onClick={() => setOpenShareProject(false)}
          >
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={
        <div className="overflow-hidden text-ellipsis whitespace-nowrap pr-4">
          Share {projectName}
        </div>
      }
      open={openShareProject}
      onCancel={handleCancel}
      footer={null}
      width={550}
      zIndex={2000}
    >
      <div className="loading-bar" hidden={!isUpdating} />
      <div className="relative">
        <Form
          form={formShare}
          layout="vertical"
          initialValues={{ gender: "male" }}
        >
          <Form.Item>
            <div className="flex gap-2 items-center">
              <Select
                mode="tags"
                className="flex-1 [&_.ant-select-selector]:min-h-10! [&_.ant-select-selector]:py-1!"
                placeholder="Enter email address to invite"
                tokenSeparators={[",", " "]}
                value={emails}
                onChange={handleEmailChange}
                maxTagCount="responsive"
                maxTagTextLength={20}
                open={false}
                disabled={!currentUserCanEdit}
              />
              {emails && emails.length > 0 && (
                <div className="w-40 shrink-0">
                  <Select
                    value={permission}
                    onChange={setPermission}
                    className="h-10!"
                  >
                    <Option value={ProjectPermission.EDITOR}>Can edit</Option>
                    <Option value={ProjectPermission.VIEWER}>Can view</Option>
                  </Select>
                </div>
              )}
            </div>
            {emails && emails.length > 0 && (
              <div className="pt-2">
                <Checkbox
                  checked={sendInvite}
                  onChange={(e) => setSendInvite(e.target.checked)}
                >
                  Send notification invite email
                </Checkbox>
                <TextArea
                  placeholder="Add a message"
                  className="mt-2!"
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  hidden={!sendInvite}
                />
              </div>
            )}
          </Form.Item>

          {emails && emails.length > 0 ? (
            <div>
              <div className="flex w-full gap-2 pt-4">
                <Button
                  type="default"
                  className="w-1/2 h-10!"
                  onClick={() => {
                    setEmails([]);
                    setPermission(ProjectPermission.VIEWER);
                    setMessage("");
                    setSendInvite(true);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  className="w-1/2 h-10!"
                  onClick={handleSentInvite}
                  disabled={
                    isUpdating || emails.length === 0
                  }
                  loading={isLoadingInvite}
                >
                  Send Invite
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <div className="font-semibold pt-0">
                People who have access to this project.
              </div>
              <div className="flex flex-col min-h-16 justify-center items-center text-gray-500 border-none py-2">
                {isLoadingSharedPermission ? (
                  <Skeleton />
                ) : sharedPermissionData &&
                  sharedPermissionData.list_users.length > 0 ? (
                  <div className="w-full flex flex-col gap-6 max-h-64 overflow-y-auto scrollbar-hide py-2">
                    {sharedPermissionData.list_users.map(
                      (user: IUserSharedProject) => {
                        return (
                          <div
                            className="flex items-center justify-between w-full"
                            key={user.userId}
                          >
                            <div className="flex gap-2 items-center">
                              <div className="w-8 h-8">
                                <Image
                                  src={
                                    user.avatar
                                      ? user.avatar
                                      : `${API_AVATAR}/?name=${user.fullName}&background=random&size=512`
                                  }
                                  alt="avatar"
                                  width={32}
                                  height={32}
                                  className="w-8 h-8 rounded-full object-cover"
                                  unoptimized
                                />
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex gap-1 items-center">
                                  {user.fullName}{" "}
                                  {user?.isVerified && (
                                    <BadgeCheck
                                      size={16}
                                      stroke="white"
                                      fill="#42A5F5"
                                    />
                                  )}
                                  {user.userId ===
                                    userPermissionData?.userId && (
                                    <span> (You) </span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-600">
                                  {user.email}
                                </div>
                              </div>
                            </div>
                            <div>
                              {user.permission === ProjectPermission.OWNER ||
                              !currentUserCanEdit ? (
                                <div>
                                  {user.permission ===
                                  ProjectPermission.OWNER ? (
                                    <span className="text-gray-600">
                                      {isTeamProject ? "Created by" : "Owner"}
                                    </span>
                                  ) : user.permission ===
                                    ProjectPermission.EDITOR ? (
                                    <span className="text-gray-600">
                                      Can edit
                                    </span>
                                  ) : user.permission ===
                                    ProjectPermission.VIEWER ? (
                                    <span className="text-gray-600">
                                      Can view
                                    </span>
                                  ) : user.permission ===
                                      ProjectPermission.INVITED &&
                                    user.invitePermission !==
                                      ProjectInvitePermission.REJECTED ? (
                                    <span className="text-gray-600">
                                      Invited Pending
                                    </span>
                                  ) : (
                                    <span className="text-gray-600">
                                      Declined Invitation
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <Select
                                  defaultValue={user.permission}
                                  className="h-8! w-36!"
                                  onChange={async (value) => {
                                    await handleUpdateUserPermission(
                                      user.email,
                                      value,
                                    );
                                  }}
                                >
                                  {user.permission !==
                                    ProjectPermission.INVITED && (
                                    <Option value={ProjectPermission.EDITOR}>
                                      Can edit
                                    </Option>
                                  )}
                                  {user.permission !==
                                    ProjectPermission.INVITED && (
                                    <Option value={ProjectPermission.VIEWER}>
                                      Can view
                                    </Option>
                                  )}
                                  {user.permission ===
                                    ProjectPermission.INVITED && (
                                    <Option
                                      value={ProjectPermission.INVITED}
                                      disabled
                                    >
                                      {user.invitePermission ===
                                      ProjectInvitePermission.VIEWER
                                        ? "Invited View"
                                        : user.invitePermission ===
                                            ProjectInvitePermission.EDITOR
                                          ? "Invited Edit"
                                          : "Declined"}
                                    </Option>
                                  )}
                                  <Option value={RESTRICTED}>
                                    Remove access
                                  </Option>
                                </Select>
                              )}
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                ) : (
                  <div>Not sharing this workspace with anyone yet</div>
                )}
              </div>

              <div className="font-semibold pt-0 pb-2">
                This project has shared access.
              </div>
              {isLoadingSharedPermission ? (
                <div className="h-16 overflow-hidden">
                  <Skeleton />
                </div>
              ) : (
                <div className="flex h-16 gap-2 items-center justify-between">
                  <div className="flex gap-2 items-center">
                    {sharedPermissionData?.project_mode ===
                      ProjectVisible.ANYONE_EDIT ||
                    sharedPermissionData?.project_mode ===
                      ProjectVisible.ANYONE_VIEW ? (
                      <div className="rounded-full bg-green-100 w-10 h-10 flex items-center justify-center">
                        <Image
                          src="/public-icon.png"
                          alt="icon"
                          width={24}
                          height={24}
                          className="w-6 h-6"
                          priority={false}
                        />
                      </div>
                    ) : (
                      <div className="rounded-full bg-gray-300 w-10 h-10 flex items-center justify-center">
                        <Image
                          src="/private-icon.png"
                          alt="icon"
                          width={24}
                          height={24}
                          className="w-6 h-6"
                          priority={false}
                        />
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-semibold pt-1">
                        {sharedPermissionData?.project_mode ===
                          ProjectVisible.ANYONE_EDIT ||
                        sharedPermissionData?.project_mode ===
                          ProjectVisible.ANYONE_VIEW
                          ? isTeamProject
                            ? "Team"
                            : "Public"
                          : "Private"}
                      </div>
                      <div className="text-xs">
                        {sharedPermissionData?.project_mode ===
                        ProjectVisible.OWNER_INVITED
                          ? isTeamProject
                            ? "Only invited teammates can access"
                            : "Owner and invited can access"
                          : sharedPermissionData?.project_mode ===
                              ProjectVisible.ANYONE_VIEW
                            ? isTeamProject
                              ? "Everyone in this workspace can view"
                              : "Any one can view"
                            : isTeamProject
                              ? "Everyone in this workspace can edit"
                              : "Any one can edit"}
                      </div>
                    </div>
                  </div>
                  {currentUserCanEdit && (
                    <Select
                      defaultValue={
                        sharedPermissionData?.project_mode as ProjectVisible
                      }
                      className="h-10 w-32 sm:w-60"
                      onChange={async (value: ProjectVisible) =>
                        await handleUpdateProjectPermission(value)
                      }
                      loading={isLoadingVisibility}
                      disabled={isUpdating}
                    >
                      <Option value={ProjectVisible.ANYONE_EDIT}>
                        {isTeamProject ? "Everyone in workspace can edit" : "Any one can edit"}
                      </Option>
                      <Option value={ProjectVisible.ANYONE_VIEW}>
                        {isTeamProject ? "Everyone in workspace can view" : "Any one can view"}
                      </Option>
                      <Option value={ProjectVisible.OWNER_INVITED}>
                        {isTeamProject ? "Only invited teammates" : "Owner and invited can access"}
                      </Option>
                    </Select>
                  )}
                </div>
              )}
              <div className="flex w-full gap-2 pt-4">
                <Button
                  type="default"
                  className="w-1/2 h-10!"
                  onClick={handleCopyLink}
                >
                  Copy Link
                </Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  className="w-1/2 h-10!"
                  onClick={() => setOpenShareProject(false)}
                >
                  Done
                </Button>
              </div>
            </div>
          )}
        </Form>
      </div>
    </Modal>
  );
}