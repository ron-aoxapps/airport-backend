export const resetPasswordTemplate = (code) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Password Reset OTP</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f6f9; font-family:Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f9; padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.05);">

          <!-- Header -->
          <tr>
            <td align="center" style="background:#0d6efd; padding:20px;">
              <h1 style="color:#ffffff; margin:0; font-size:22px;">Airport Valley</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:30px;">
              <h2 style="margin-top:0; color:#333333;">Password Reset Request</h2>
              <p style="color:#555555; font-size:14px; line-height:22px;">
                We received a request to reset your password. Use the One-Time Password (OTP) below to proceed:
              </p>

              <!-- OTP Box -->
              <div style="text-align:center; margin:30px 0;">
                <span style="
                  display:inline-block;
                  padding:15px 25px;
                  font-size:28px;
                  letter-spacing:8px;
                  font-weight:bold;
                  color:#0d6efd;
                  background:#f1f5ff;
                  border-radius:6px;
                ">
                  ${code}
                </span>
              </div>

              <p style="color:#555555; font-size:14px;">
                This OTP is valid for <strong>15 minutes</strong>.
              </p>

              <p style="color:#555555; font-size:14px; line-height:22px;">
                If you did not request a password reset, please ignore this email. Your account remains secure.
              </p>

              <p style="margin-top:30px; font-size:14px; color:#333333;">
                Regards,<br/>
                <strong>Airport Valley Team</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="background:#f8f9fa; padding:20px; font-size:12px; color:#999999;">
              © ${new Date().getFullYear()} Airport Valley. All rights reserved.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

export const sendAccountLink = (resetLink) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to Airport Valley</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f6f9; font-family:Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0; background:#f4f6f9;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.05);">

          <!-- Header -->
          <tr>
            <td align="center" style="background:#0d6efd; padding:20px;">
              <h1 style="color:#ffffff; margin:0;">Airport Valley</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:30px;">
              <h2 style="margin-top:0; color:#333;">Welcome to Airport Valley</h2>

              <p style="color:#555; font-size:14px; line-height:22px;">
                Your account has been successfully created on <strong>Airport Valley Mobile App</strong> 
                for vehicle tracking and monitoring services.
              </p>

              <p style="color:#555; font-size:14px; line-height:22px;">
                To activate your account and set your password, please click the button below:
              </p>

              <div style="text-align:center; margin:30px 0;">
                <a href="${resetLink}" 
                   style="background:#0d6efd; color:#ffffff; padding:12px 25px; 
                          text-decoration:none; border-radius:5px; font-size:14px;">
                  Set Your Password
                </a>
              </div>

              <p style="font-size:13px; color:#777;">
                This link is valid for 15 minutes.
              </p>

              <hr style="border:none; border-top:1px solid #eee; margin:30px 0;" />

              <h3 style="color:#333;">Download Our Mobile App</h3>

              <p style="font-size:14px; color:#555;">
                Track your vehicle in real-time using our mobile application.
              </p>

              <div style="text-align:center; margin:20px 0;">
                <a href="YOUR_ANDROID_APP_LINK" style="margin-right:10px; text-decoration:none;">
                  📱 Download for Android
                </a>
                <br/><br/>
                <a href="YOUR_IOS_APP_LINK" style="text-decoration:none;">
                  🍎 Download for iPhone
                </a>
              </div>

              <p style="margin-top:30px; font-size:14px;">
                Regards,<br/>
                <strong>Airport Valley Team</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="background:#f8f9fa; padding:20px; font-size:12px; color:#999;">
              © ${new Date().getFullYear()} Airport Valley. All rights reserved.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
