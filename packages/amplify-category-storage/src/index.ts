import * as path from 'path';
const sequential = require('promise-sequential');
import { updateConfigOnEnvInit } from './provider-utils/awscloudformation';
import { AmplifyCategories } from 'amplify-cli-core';

async function add(context: any, providerName: any, service: any) {
  const options = {
    service,
    providerPlugin: providerName,
  };

  const providerController = require(`./provider-utils/${providerName}`);

  if (!providerController) {
    context.print.error('Provider not configured for this category');
    return;
  }

  return providerController.addResource(context, AmplifyCategories.STORAGE, service, options);
}

async function categoryConsole(context: any) {
  context.print.info(`to be implemented: ${AmplifyCategories.STORAGE} console`);
}

async function migrateStorageCategory(context: any) {
  const { projectPath, amplifyMeta } = context.migrationInfo;
  const migrateResourcePromises: any = [];

  Object.keys(amplifyMeta).forEach(categoryName => {
    if (categoryName === AmplifyCategories.STORAGE) {
      Object.keys(amplifyMeta[AmplifyCategories.STORAGE]).forEach(resourceName => {
        try {
          const providerController = require(`./provider-utils/${amplifyMeta[AmplifyCategories.STORAGE][resourceName].providerPlugin}`);

          if (providerController) {
            migrateResourcePromises.push(
              providerController.migrateResource(context, projectPath, amplifyMeta[AmplifyCategories.STORAGE][resourceName].service, resourceName),
            );
          } else {
            context.print.error(`Provider not configured for ${AmplifyCategories.STORAGE}: ${resourceName}`);
          }
        } catch (e) {
          context.print.warning(`Could not run migration for ${AmplifyCategories.STORAGE}: ${resourceName}`);
          throw e;
        }
      });
    }
  });

  await Promise.all(migrateResourcePromises);
}

async function getPermissionPolicies(context: any, resourceOpsMapping: any) {
  const amplifyMetaFilePath = context.amplify.pathManager.getAmplifyMetaFilePath();
  const amplifyMeta = context.amplify.readJsonFile(amplifyMetaFilePath);
  const permissionPolicies: any = [];
  const resourceAttributes: any = [];
  const storageCategory = AmplifyCategories.STORAGE;

  Object.keys(resourceOpsMapping).forEach(resourceName => {
    try {
      const providerPlugin =
        'providerPlugin' in resourceOpsMapping[resourceName]
          ? resourceOpsMapping[resourceName].providerPlugin
          : amplifyMeta[storageCategory][resourceName].providerPlugin;
      const service =
        'service' in resourceOpsMapping[resourceName]
          ? resourceOpsMapping[resourceName].service
          : amplifyMeta[storageCategory][resourceName].service;

      if (providerPlugin) {
        const providerController = require(`./provider-utils/${providerPlugin}`);
        const { policy, attributes } = providerController.getPermissionPolicies(
          context,
          service,
          resourceName,
          resourceOpsMapping[resourceName],
        );
        if (Array.isArray(policy)) {
          permissionPolicies.push(...policy);
        } else {
          permissionPolicies.push(policy);
        }
        resourceAttributes.push( { resourceName, attributes, storageCategory });
      } else {
        context.print.error(`Provider not configured for ${storageCategory}: ${resourceName}`);
      }
    } catch (e) {
      context.print.warning(`Could not get policies for ${storageCategory}: ${resourceName}`);
      throw e;
    }
  });

  return { permissionPolicies, resourceAttributes };
}

async function executeAmplifyCommand(context: any) {
  let commandPath = path.normalize(path.join(__dirname, 'commands'));

  if (context.input.command === 'help') {
    commandPath = path.join(commandPath, AmplifyCategories.STORAGE);
  } else {
    commandPath = path.join(commandPath, AmplifyCategories.STORAGE, context.input.command);
  }

  const commandModule = require(commandPath);

  await commandModule.run(context);
}

async function handleAmplifyEvent(context: any, args: any) {
  context.print.info(`${AmplifyCategories.STORAGE} handleAmplifyEvent to be implemented`);
  context.print.info(`Received event args ${args}`);
}

async function initEnv(context: any) {
  const { resourcesToBeSynced, allResources } = await context.amplify.getResourceStatus(AmplifyCategories.STORAGE);
  const isPulling = context.input.command === 'pull' || (context.input.command === 'env' && context.input.subCommands[0] === 'pull');
  let toBeSynced = [];

  if (resourcesToBeSynced && resourcesToBeSynced.length > 0) {
    toBeSynced = resourcesToBeSynced.filter((b: any) => b.category === AmplifyCategories.STORAGE);
  }

  toBeSynced
    .filter((storageResource: any) => storageResource.sync === 'unlink')
    .forEach((storageResource: any) => {
      context.amplify.removeResourceParameters(context, AmplifyCategories.STORAGE, storageResource.resourceName);
    });

  let tasks: any = [];

  // For pull change detection for import sees a difference, to avoid duplicate tasks we don't
  // add the syncable resources, as allResources covers it, otherwise it is required for env add
  // to populate the output value and such, these sync resources have the 'refresh' sync value.
  if (!isPulling) {
    tasks = tasks.concat(toBeSynced);
  }

  // check if this initialization is happening on a pull
  if (isPulling && allResources.length > 0) {
    tasks.push(...allResources);
  }

  // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'storageResource' implicitly has an 'any... Remove this comment to see the full error message
  const storageTasks = tasks.map(storageResource => {
    const { resourceName, service } = storageResource;

    return async () => {
      const config = await updateConfigOnEnvInit(context, AmplifyCategories.STORAGE, resourceName, service);

      context.amplify.saveEnvResourceParameters(context, AmplifyCategories.STORAGE, resourceName, config);
    };
  });

  await sequential(storageTasks);
}

module.exports = {
  add,
  console : categoryConsole,
  initEnv,
  migrate: migrateStorageCategory,
  getPermissionPolicies,
  executeAmplifyCommand,
  handleAmplifyEvent,
  category: AmplifyCategories.STORAGE,
};
