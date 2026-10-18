import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { ActionExecutor, MockPlatform } from "@dts/desktop-control";
import { ApprovalStore } from "@dts/permissions";

const DEV_URL = process.env.DTS_RENDERER_URL; // set only in development
const approvals = new ApprovalStore();
// Phase 0: simulated platform. The Windows adapter lands in Phase 1.
const executor = new ActionExecutor({ platform: new MockPlatform(), approvals });

let win: BrowserWindow | null = null;

function status() {
  return {
    authorized: executor.isAuthorized,
    userControlled: executor.isUserControlled,
    platform: "simulated" as const,
    version: app.getVersion(),
  };
}

function trusted(e: IpcMainInvokeEvent): boolean {
  const url = e.senderFrame?.url ?? "";
  return (
    e.sender === win?.webContents && (DEV_URL ? url.startsWith(DEV_URL) : url.startsWith("file://"))
  );
}

function handle(channel: string, fn: () => Promise<unknown> | unknown) {
  ipcMain.handle(channel, async (e) => {
    if (!trusted(e)) throw new Error("Untrusted IPC sender.");
    return fn();
  });
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 720,
    backgroundColor: "#202124",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    const ok = DEV_URL ? url.startsWith(DEV_URL) : url.startsWith("file://");
    if (!ok) e.preventDefault();
  });
  if (DEV_URL) await win.loadURL(DEV_URL);
  else await win.loadFile(path.join(__dirname, "../renderer/index.html"));
}

app.whenReady().then(async () => {
  handle("dts:get-status", () => status());
  handle("dts:authorize", async () => {
    const res = await dialog.showMessageBox(win!, {
      type: "question",
      title: "Authorize desktop control",
      message: "Allow DTS Live Desktop Operator to operate your computer?",
      detail:
        "The AI can see your screen and send mouse and keyboard input. You can press Take Control at any time to stop it immediately.",
      buttons: ["Cancel", "Authorize"],
      defaultId: 0,
      cancelId: 0,
    });
    if (res.response === 1) executor.authorize();
    return status();
  });
  handle("dts:take-control", async () => {
    await executor.takeControl();
    return status();
  });
  handle("dts:resume", () => {
    if (executor.isAuthorized) executor.resume();
    return status();
  });
  await createWindow();
});

app.on("window-all-closed", () => {
  void executor.revoke().finally(() => app.quit());
});
