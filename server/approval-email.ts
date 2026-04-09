import nodemailer from "nodemailer";

type SendApprovalEmailInput = {
  to: string;
};

type SendAccessRequestNotificationInput = {
  requestId: string;
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

function getAppBaseUrl() {
  const configured = process.env.APP_BASE_URL?.trim();
  const renderExternal = process.env.RENDER_EXTERNAL_URL?.trim();
  const fallbackLocal = `http://localhost:${process.env.PORT || "5000"}`;

  const baseUrl = configured || renderExternal || fallbackLocal;
  return baseUrl.replace(/\/+$/, "");
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
        <p>Hello,</p>
        <p>Your request to access the Test feedback section has been approved.</p>
        <p>You can now log in from the Welcome page using your registered email and password.</p>
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

  const baseUrl = getAppBaseUrl();
  const encodedRequestId = encodeURIComponent(input.requestId);
  const approveUrl = `${baseUrl}/api/admin/access-requests/${encodedRequestId}/approve-from-email`;
  const rejectUrl = `${baseUrl}/api/admin/access-requests/${encodedRequestId}/reject-from-email`;
  const approveUrlQuery = `${baseUrl}/api/admin/access-requests/approve-from-email?requestId=${encodedRequestId}`;
  const rejectUrlQuery = `${baseUrl}/api/admin/access-requests/reject-from-email?requestId=${encodedRequestId}`;

  try {
    await config.transporter.sendMail({
      from: config.from,
      to: config.gmailUser,
      subject: "New Test Feedback Access Request",
      html: `
        <p>A new user requested access to the Test feedback system.</p>
        <p><strong>Email:</strong> ${input.requesterEmail}</p>
        <p>
          <a href="${approveUrl}" style="display:inline-block;padding:10px 16px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;margin-right:10px;">Approve</a>
          <a href="${rejectUrl}" style="display:inline-block;padding:10px 16px;background:#dc2626;color:#fff;text-decoration:none;border-radius:6px;">Reject</a>
        </p>
        <p>If the buttons do not work in your email client, use these links:</p>
        <p><a href="${approveUrlQuery}">Approve (fallback)</a></p>
        <p><a href="${rejectUrlQuery}">Reject (fallback)</a></p>
      `,
    });
  } catch (error) {
    console.error("[EMAIL] Failed to send admin access request notification:", error);
    return false;
  }

  return true;
}
