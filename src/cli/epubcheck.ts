import { spawn } from 'node:child_process';

export async function runEpubCheck(file: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('epubcheck', [file], { stdio: 'inherit' });
    child.once('error', (error) =>
      reject(new Error('未找到 epubcheck，请先安装 EPUBCheck 5.3+', { cause: error })),
    );
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`EPUBCheck 校验失败，退出码 ${String(code)}`));
    });
  });
}

export async function commandAvailable(
  command: string,
  args: string[] = ['--version'],
): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.once('error', () => resolve(false));
    child.once('exit', (code) => resolve(code === 0));
  });
}
