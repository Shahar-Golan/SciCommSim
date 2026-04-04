import nodemailer from "nodemailer";

type SendApprovalEmailInput = {
  to: string;
  username: string;
};

type SendAccessRequestNotificationInput = {
  requestId: string;
  username: string;
  requesterEmail: string;
};

function getTransporter() {
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
  const from = process.env.APPROVAL_EMAIL_FROM || gmailUser;

  if (!gmailUser || !gmailAppPassword || !from) {
    return null;
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: gmailUser,
      pass: gmailAppPassword,
    },
  });

  return { transporter, from, gmailUser };
}

export async function sendApprovalEmail(input: SendApprovalEmailInput): Promise<boolean> {
  const config = getTransporter();
  if (!config) {
    console.warn("[EMAIL] GMAIL_USER, GMAIL_APP_PASSWORD, or APPROVAL_EMAIL_FROM missing; skipping approval email.");
    return false;
  }

  try {
    await config.transporter.sendMail({
      from: config.from,
      to: input.to,
      subject: "Your Test Feedback Access Was Approved",
      html: `
        <p>Hello ${input.username},</p>
        <p>Your request to access the Test feedback section has been approved.</p>
        <p>You can now log in from the Welcome page using your registered username and password.</p>
      `,
    });
  } catch (error) {
    console.error("[EMAIL] Failed to send approval email:", error);
    return false;
  }

  return true;
}

export async function sendAccessRequestNotificationToAdmin(input: SendAccessRequestNotificationInput): Promise<boolean> {
  const config = getTransporter();
  if (!config) {
    console.warn("[EMAIL] GMAIL_USER, GMAIL_APP_PASSWORD, or APPROVAL_EMAIL_FROM missing; skipping admin notification email.");
    return false;
  }

  const baseUrl = process.env.APP_BASE_URL || "http://localhost:5000";
  const approveUrl = `${baseUrl}/api/admin/access-requests/${input.requestId}/approve-from-email`;
  const rejectUrl = `${baseUrl}/api/admin/access-requests/${input.requestId}/reject-from-email`;

  try {
    await config.transporter.sendMail({
      from: config.from,
      to: config.gmailUser,
      subject: "New Test Feedback Access Request",
      html: `
        <p>A new user requested access to the Test feedback system.</p>
        <p><strong>Username:</strong> ${input.username}</p>
        <p><strong>Email:</strong> ${input.requesterEmail}</p>
        <p>
          <a href="${approveUrl}" style="display:inline-block;padding:10px 16px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;margin-right:10px;">Approve</a>
          <a href="${rejectUrl}" style="display:inline-block;padding:10px 16px;background:#dc2626;color:#fff;text-decoration:none;border-radius:6px;">Reject</a>
        </p>
      `,
    });
  } catch (error) {
    console.error("[EMAIL] Failed to send admin access request notification:", error);
    return false;
  }

  return true;
}
