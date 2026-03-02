'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fse from 'fs-extra';
import logger from './logger';
import app from './app';
import initCommands from './initCommands';
import { reportError } from './helper';
import fileActivityMonitor from './modules/fileActivityMonitor';
import { tryLoadConfigs, getConfigPath, readConfigsFromSettings, getBaseFolderPaths } from './modules/config';
import { getAllFileService, createFileService, disposeFileService } from './modules/serviceManager';
import { getWorkspaceFolders, setContextValue } from './host';
import RemoteExplorer from './modules/remoteExplorer';

async function setupWorkspaceFolder(dir) {
  const configs = await tryLoadConfigs(dir);
  configs.forEach(config => {
    createFileService(config, dir);
  });
}

async function setupSettings()
{
  const configs = await readConfigsFromSettings();
  const workspacePaths = getBaseFolderPaths(configs[0]);
  logger.info(`Setting up settings for workspace paths: ${workspacePaths.join(', ')}`);
  workspacePaths.forEach(workspacePath => createFileService(configs[0], workspacePath));
}

async function setupFolder(workspaceFolders) : Promise<void[]> {
  // Check if there is any config file in workspace folder
  let hasConfigFile = false;

  for (const folder of workspaceFolders) {
    const dir = folder.uri ? folder.uri.fsPath : folder;
    const configPath = getConfigPath(dir);
    if (fse.pathExistsSync(configPath)) {
      hasConfigFile = true;
      break;
    }
  }

  if (hasConfigFile) {
    logger.info('Found config file in workspace folders. Loading configs from files.');
    const pendingInits = workspaceFolders.map(folder => setupWorkspaceFolder(folder.uri.fsPath));
    return Promise.all(pendingInits);
  } else {
    logger.info('No config file found in workspace folders. Loading config from settings.');
    const PromiseArray: Promise<void[]> = Promise.all([setupSettings()]);
    return PromiseArray;
  }
}

function setup(context: vscode.ExtensionContext, workspaceFolders: vscode.WorkspaceFolder[]) {
  fileActivityMonitor.init(context);
  //const pendingInits = workspaceFolders.map(folder => setupWorkspaceFolder(folder.uri.fsPath));
  return setupFolder(workspaceFolders);
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  try {
    initCommands(context);
  } catch (error) {
    reportError(error, 'initCommands');
  }

  const workspaceFolders = getWorkspaceFolders();
  if (!workspaceFolders) {
    return;
  }

  setContextValue('enabled', true);
  app.sftpBarItem.show();
  app.state.subscribe(_ => {
    const currentText = app.sftpBarItem.getText();
    // current is showing profile
    if (currentText.startsWith('SFTP')) {
      app.sftpBarItem.reset();
    }
    if (app.remoteExplorer) {
      app.remoteExplorer.refresh();
    }
  });
  try {
    await setup(context, workspaceFolders);
    app.remoteExplorer = new RemoteExplorer(context);
  } catch (error) {
    reportError(error);
  }
}

export function deactivate() {
  fileActivityMonitor.destory();
  getAllFileService().forEach(disposeFileService);
}
