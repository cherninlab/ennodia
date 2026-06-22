type User = {
  id: string;
  name: string;
  email: string;
  active: boolean;
};

type Mailer = {
  send(to: string, body: string): Promise<void>;
};

async function fetchUser(userId: string): Promise<User> {
  return {
    id: userId,
    name: "Ada",
    email: "ada@example.com",
    active: true,
  };
}

export async function sendWelcomeEmail(
  userId: string,
  mailer: Mailer,
): Promise<"sent" | "skipped"> {
  const user = fetchUser(userId);

  if (!user.active) {
    return "skipped";
  }

  await mailer.send(user.email, `Welcome ${user.name}`);
  return "sent";
}
