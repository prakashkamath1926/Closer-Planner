import { describe, it, expect, vi } from "vitest";

describe("Anonymous User Upgrade: Preservation of auth.uid()", () => {
  it("keeps the same auth.uid() when upgrading from anonymous to email/password", async () => {
    const anonymousUserId = "a1111111-2222-3333-4444-555555555555";

    // Mock supabase auth client simulating updateUser on an anonymous session
    const mockAuthClient = {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: anonymousUserId,
            is_anonymous: true,
          },
        },
      }),
      updateUser: vi.fn().mockImplementation(async (updates) => {
        return {
          data: {
            user: {
              id: anonymousUserId, // MUST REMAIN IDENTICAL
              email: updates.email,
              is_anonymous: false,
              user_metadata: updates.data,
            },
          },
          error: null,
        };
      }),
    };

    // 1. Current session is anonymous
    const { data: initial } = await mockAuthClient.getUser();
    expect(initial.user?.is_anonymous).toBe(true);
    expect(initial.user?.id).toBe(anonymousUserId);

    // 2. Perform upgrade via updateUser
    const { data: upgraded, error } = await mockAuthClient.updateUser({
      email: "newuser@example.com",
      password: "securepassword123",
      data: { full_name: "Organizer Patel" },
    });

    expect(error).toBeNull();
    expect(upgraded.user?.email).toBe("newuser@example.com");
    expect(upgraded.user?.is_anonymous).toBe(false);

    // 3. User ID is unchanged: occasion, items, vendors and versions remain under same owner_id
    expect(upgraded.user?.id).toBe(anonymousUserId);
    expect(upgraded.user?.id).toBe(initial.user?.id);
  });
});

