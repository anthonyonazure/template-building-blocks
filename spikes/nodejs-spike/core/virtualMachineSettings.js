var _ = require('../lodashMixins.js');
var fs = require('fs');
var storageSettings = require('./storageSettings.js');
var nicSettings = require('./networkInterfaceSettings.js');
var avSetSettings = require('./availabilitySetSettings.js');
var resources = require('./resources.js');
let v = require('./validation.js');

const defaultsPath = './defaults/virtualMachinesSettings.';

let output = {};

function merge(settings) {
    let defaultsFile = defaultsPath.concat(settings.osDisk.osType, '.json');
    let defaults = JSON.parse(fs.readFileSync(defaultsFile, 'UTF-8'));

    return v.merge(settings, defaults, defaultsCustomizer, childResourceToMerge);
}

function validate(settings) {
    return v.validate(settings, virtualMachineValidations, settings)
}

// if nics and extensions are not specified in the parameters, use from defaults, else ignore defaults
function defaultsCustomizer(objValue, srcValue, key) {
    if (objValue && key === "nics") {
        if (srcValue && _.isArray(srcValue) && srcValue.length > 0) {
            objValue.splice(0, 1);
        }
    }
    if (objValue && key === "extensions") {
        if (srcValue) {
            srcValue.forEach((extension) => {
                if (_.toLower(extension.type) === 'iaasdiagnostics' || _.toLower(extension.type) === 'linuxdiagnostic') {
                    // if user provided the diagonistic extension, then use that instead of the default one
                    // Through VM building block only the diagonistic extension can be specified. IGNORE the rest of the extensions. 
                    objValue.splice(0, 1);
                    objValue.push(extension);
                }
            });
            // we have processed all extensions from parameters file. 
            srcValue.splice(0, srcValue.length);
        }
    }
}

let virtualMachineValidations = {
    virtualNetwork: (result, parentKey, key, value, parent, baseObjectSettings) => {
        if (_.isNullOrWhitespace(value.name)) {
            result.push({
                name: _.join((parentKey ? [parentKey, key] : [key]), '.'),
                message: "VirtualNetwork name cannot be null"
            })
        }
    },
    vmCount: (result, parentKey, key, value, parent, baseObjectSettings) => {
        if (!_.isNumber(value) || value < 1) {
            result.push({
                name: _.join((parentKey ? [parentKey, key] : [key]), '.'),
                message: "Value should be greater than 1."
            })
        }
    },
    namePrefix: v.validationUtilities.isNullOrWhitespace,
    computerNamePrefix: (result, parentKey, key, value, parent, baseObjectSettings) => {
        if (_.isNullOrWhitespace(value) || value.length >= 6) {
            result.push({
                name: _.join((parentKey ? [parentKey, key] : [key]), '.'),
                message: "Valid should not be more than 6 char long."
            })
        }
    },
    size: v.validationUtilities.isNullOrWhitespace,
    osDisk: (result, parentKey, key, value, parent, baseObjectSettings) => {
        if (_.isNullOrWhitespace(value.osType) || (_.toLower(value.osType) !== 'linux' && _.toLower(value.osType) !== 'windows')) {
            result.push({
                name: _.join((parentKey ? [parentKey, key] : [key]), '.'),
                message: "Valid values are: 'linux', 'windows'."
            })
        };
        if (value.encryptionSettings) {
            if (!_.isBoolean(value.encryptionSettings.enabled)) {
                result.push({
                    name: _.join((parentKey ? [parentKey, key] : [key]), '.'),
                    message: "Valid values for 'osDisk.encryptionSettings.enabled' are: true, false"
                });
            };
            if (_.isNullOrWhitespace(value.encryptionSettings.diskEncryptionKey)) {
                result.push({
                    name: _.join((parentKey ? [parentKey, key] : [key]), '.'),
                    message: "encryptionSettings.diskEncryptionKey cannot be null or empty"
                });
            };
            if (_.isNullOrWhitespace(value.encryptionSettings.diskEncryptionKey.secretUrl)) {
                result.push({
                    name: _.join((parentKey ? [parentKey, key] : [key]), '.'),
                    message: "encryptionSettings.diskEncryptionKey.secretUrl cannot be null or empty"
                });
            };
            if (_.isNullOrWhitespace(value.encryptionSettings.diskEncryptionKey.sourceVaultName)) {
                result.push({
                    name: _.join((parentKey ? [parentKey, key] : [key]), '.'),
                    message: "encryptionSettings.diskEncryptionKey.sourceVaultName cannot be null or empty"
                });
            };
            if (_.isNullOrWhitespace(value.encryptionSettings.keyEncryptionKey)) {
                result.push({
                    name: _.join((parentKey ? [parentKey, key] : [key]), '.'),
                    message: "encryptionSettings.keyEncryptionKey cannot be null or empty"
                });
            };
            if (_.isNullOrWhitespace(value.encryptionSettings.keyEncryptionKey.keyUrl)) {
                result.push({
                    name: _.join((parentKey ? [parentKey, key] : [key]), '.'),
                    message: "encryptionSettings.keyEncryptionKey.secretUrl cannot be null or empty"
                });
            };
            if (_.isNullOrWhitespace(value.encryptionSettings.keyEncryptionKey.sourceVaultName)) {
                result.push({
                    name: _.join((parentKey ? [parentKey, key] : [key]), '.'),
                    message: "encryptionSettings.keyEncryptionKey.sourceVaultName cannot be null or empty"
                });
            };
        }
    },
    existingWindowsServerlicense: v.validationUtilities.isBoolean,
    adminUsername: v.validationUtilities.isNullOrWhitespace,
    osAuthenticationType: (result, parentKey, key, value, parent, baseObjectSettings) => {
        if (_.isNullOrWhitespace(value) || (_.toLower(value) !== 'ssh' && _.toLower(value) !== 'password')) {
            result.push({
                name: _.join((parentKey ? [parentKey, key] : [key]), '.'),
                message: "Valid values are: 'ssh', 'password'."
            })
        }
        if (_.toLower(value) === 'ssh' && (!parent.hasOwnProperty('sshPublicKey') || _.isNullOrWhitespace(parent.sshPublicKey))) {
            result.push({
                name: _.join((parentKey ? [parentKey, key] : [key]), '.'),
                message: "'sshPublicKey' cannot be null, if osAuthenticationType is 'ssh'"
            })
        }
        if (_.toLower(value) === 'password' && (!parent.hasOwnProperty('adminPassword') || _.isNullOrWhitespace(parent.adminPassword))) {
            result.push({
                name: _.join((parentKey ? [parentKey, key] : [key]), '.'),
                message: "'adminPassword' cannot be null, if osAuthenticationType is 'password'"
            })
        }
    },
    storageAccounts: storageSettings.storageValidations,
    diagonisticStorageAccounts: storageSettings.diagonisticValidations,
    nics: (result, parentKey, key, value, parent, baseObjectSettings) => {
        // Validate the network interfaces individually
        v.reduce({
            validations: nicSettings.validations,
            value: value,
            parentKey: parentKey,
            parentValue: parent,
            baseObjectSettings: baseObjectSettings,
            accumulator: result
        });

        // Make sure only one network interface is primary
        let primaryNicCount = _.reduce(parent.nics, (accumulator, value, index, collection) => {
            if (value.isPrimary) {
                accumulator++;
            }

            return accumulator;
        }, 0);

        if (primaryNicCount !== 1) {
            result.push({
                name: '.nics',
                message: "Virtual machine can have only 1 primary NetworkInterface."
            })
        }
    },
    availabilitySet: (result, parentKey, key, value, parent, baseObjectSettings) => {
        v.reduce({
            validations: avSetSettings.validations,
            value: value,
            parentKey: parentKey,
            parentValue: parent,
            baseObjectSettings: baseObjectSettings,
            accumulator: result
        });
    }
};

let childResourceToMerge = {
    storageAccounts: storageSettings.mergeWithDefaults,
    diagonisticStorageAccounts: storageSettings.mergeWithDefaults,
    nics: nicSettings.mergeWithDefaults,
    availabilitySet: avSetSettings.mergeWithDefaults
}

let processorProperties = {
    existingWindowsServerlicense: (value, key, index, parent) => {
        if (_.toLower(parent.osType) === "windows" && value) {
            return {
                licenseType: "Windows_Server"
            }
        }else {
            return {
                licenseType: ""
            }
        }
    },
    availabilitySet: (value, key, index, parent) => {
        if (_.toLower(value.useExistingAvailabilitySet) === "no" && parent.vmCount < 2) {
            return;
        }

        return {
            availabilitySet: {
                id: resources.resourceId(value.subscriptionId, value.resourceGroupName, 'Microsoft.Network/availabilitySets', value.name)
            }
        }
    },
    size: (value, key, index, parent) => {
        return {
            hardwareProfile: {
                vmSize: value
            }
        }
    },
    imageReference: (value, key, index, parent) => {
        return {
            storageProfile: {
                imageReference: value
            }
        }
    },
    osDisk: (value, key, index, parent) => {
        let instance = {
            name: parent.name.concat('-os.vhd'),
            createOption: value.createOption,
            caching: value.caching
        }
        if (value.image) {
            instance.image = {
                uri: value.image
            }
        }
        if (value.encryptionSettings) {
            instance.encryptionSettings = {
                diskEncryptionKey: {
                    secretUrl: value.encryptionSettings.diskEncryptionKey.secretUrl,
                    sourceVault: {
                        id: resources.resourceId(value.encryptionSettings.subscriptionId, value.encryptionSettings.resourceGroupName, "Microsoft.KeyVault/vaults", value.encryptionSettings.diskEncryptionKey.sourceVaultName)
                    }
                },
                keyEncryptionKey: {
                    keyUrl: value.encryptionSettings.keyEncryptionKey.keyUrl,
                    sourceVault: {
                        id: resources.resourceId(value.encryptionSettings.subscriptionId, value.encryptionSettings.resourceGroupName, "Microsoft.KeyVault/vaults", value.encryptionSettings.keyEncryptionKey.sourceVaultName)
                    }
                },
                enabled: true
            }
        }

        if (parent.storageAccounts.managed) {
            instance.managedDisk = {
                storageAccountType: parent.storageAccounts.skuType
            }
        } else {
            let storageAccounts = parent.storageAccounts.accounts;
            output.storageAccounts.forEach((account) => {
                storageAccounts.push(account.name);
            });
            let stroageAccountToUse = index % storageAccounts.length;
            instance.vhd = {
                uri: `http://${storageAccounts[stroageAccountToUse]}.blob.core.windows.net/vhds/${parent.name}-os.vhd`
            }
        }

        return {
            osType: _.toLower(value.osType),
            storageProfile: {
                osDisk: instance
            }
        }
    },
    dataDisks: (value, key, index, parent) => {
        let disks = [];
        for (let i = 0; i < value.count; i++) {
            let instance = {
                name: 'dataDisk'.concat(i + 1),
                diskSizeGB: value.properties.diskSizeGB,
                lun: i,
                caching: value.properties.caching,
                createOption: value.properties.createOption
            };

            if (parent.storageAccounts.managed) {
                instance.managedDisk = {
                    storageAccountType: parent.storageAccounts.skuType
                }
            } else {
                let storageAccounts = parent.storageAccounts.accounts;
                output.storageAccounts.forEach((account) => {
                    storageAccounts.push(account.name);
                });
                let stroageAccountToUse = index % storageAccounts.length;
                instance.vhd = {
                    uri: `http://${storageAccounts[stroageAccountToUse]}.blob.core.windows.net/vhds/${parent.name}-dataDisk${i + 1}.vhd`
                }
            }

            disks.push(instance)
        }
        return {
            storageProfile: {
                dataDisks: disks
            }
        }
    },
    nics: (value, key, index, parent) => {
        let ntwkInterfaces = _.transform(output.nics, (result, n) => {
            if (_.includes(n.name, parent.name)) {
                let nicRef = {
                    id: resources.resourceId(parent.subscriptionId, parent.resourceGroupName, 'Microsoft.Network/networkInterfaces', n.name),
                    properties: {
                        primary: n.primary
                    }
                }
                result.push(nicRef);
            }
            return result;
        }, []);
        return {
            networkProfile: {
                networkInterfaces: ntwkInterfaces
            }
        }
    },
    diagonisticStorageAccounts: (value, key, index, parent) => {
        // get the diagonstic account name for the VM
        let diagonisticAccounts = parent.diagonisticStorageAccounts.accounts;
        output.diagonisticStorageAccounts.forEach((account) => {
            diagonisticAccounts.push(account.name);
        });
        let diagonisticAccountToUse = index % diagonisticAccounts.length;
        let diagnosticAccountName = diagonisticAccounts[diagonisticAccountToUse];

        return {
            diagnosticsProfile: {
                bootDiagnostics: {
                    enabled: true,
                    storageUri: `http://${diagnosticAccountName}.blob.core.windows.net`
                }
            }
        };
    },
    extensions: (value, key, index, parent) => {
        let processedExtensions = { "extensions": [] };
        value.forEach((extension) => {
            let temp = {};
            temp.name = parent.name.concat('/', extension.name);
            temp.publisher = extension.publisher;
            temp.type = extension.type;
            temp.typeHandlerVersion = extension.typeHandlerVersion;
            temp.autoUpgradeMinorVersion = extension.autoUpgradeMinorVersion;

            if ((_.toLower(extension.type) === 'iaasdiagnostics' || _.toLower(extension.type) === 'linuxdiagnostic') && extension.settingsConfig.hasOwnProperty('metricsclosing1')) {
                temp.settings = {};
                temp.protectedSettings = {};
                let vmId = resources.resourceId(parent.subscriptionId, parent.resourceGroupName, 'Microsoft.Compute/virtualMachines', parent.name);

                // get the diagonstic account name for the VM
                let diagonisticAccounts = parent.diagonisticStorageAccounts.accounts;
                output.diagonisticStorageAccounts.forEach((account) => {
                    diagonisticAccounts.push(account.name);
                });
                let diagonisticAccountToUse = index % diagonisticAccounts.length;
                let diagnosticAccountName = diagonisticAccounts[diagonisticAccountToUse];
                let accountResourceId = resources.resourceId(parent.diagonisticStorageAccounts.subscriptionId, parent.diagonisticStorageAccounts.resourceGroupName, 'Microsoft.Storage/storageAccounts', diagnosticAccountName);
                let xmlCfg = extension.settingsConfig.metricsstart.concat(extension.settingsConfig.metricscounters, extension.settingsConfig.metricsclosing1, vmId, extension.settingsConfig.metricsclosing2);
                let base64XmlCfg = new Buffer(xmlCfg).toString('base64');

                // build settings property for diagonistic extension
                temp.settings.StorageAccount = diagnosticAccountName;
                temp.settings.xmlCfg = base64XmlCfg.toString();

                // build protectedSettings property for diagonistic extension
                temp.protectedSettings.storageAccountName = diagnosticAccountName;
                temp.protectedSettings.storageAccountEndPoint = "https://core.windows.net/";
                temp.protectedSettings.storageAccountKey1 = `[listKeys('${accountResourceId}', '2015-06-15').key1]`;
            } else {
                temp.settings = extension.settingsConfig;
                temp.protectedSettings = extension.protectedSettingsConfig;
            }

            processedExtensions.extensions.push(temp);
        })
        return processedExtensions;
    },
    computerNamePrefix: (value, key, index, parent) => {
        return {
            computerName: value.concat("-vm", index + 1)
        }
    },
    adminPassword: (value, key, index, parent) => {
        if (_.toLower(parent.osAuthenticationType) === "password" && _.toLower(parent.osDisk.osType) === "windows") {
            return {
                windowsConfiguration: {
                    "provisionVmAgent": "true"
                }
            }
        } else {
             return {
                linuxConfiguration: null
            }
        }

    },
    sshPublicKey: (value, key, index, parent) => {
        return;
    },
    passThrough: (value, key, index) => {
        let temp = {};
        temp[key] = value;
        return temp;
    }
}

let storageAccountsProcessed = false;
let availabilitySetProcessed = false;
let diagonisticStorageAccountsProcessed = false;
let processChildResources = {
    storageAccounts: (value, key, index, parent) => {
        if (!storageAccountsProcessed) {
            let mergedCol = (output["storageAccounts"] || (output["storageAccounts"] = [])).concat(storageSettings.processStorageSettings(value, parent));
            output.storageAccounts = mergedCol;
            storageAccountsProcessed = true;
        }
    },
    diagonisticStorageAccounts: (value, key, index, parent) => {
        if (!diagonisticStorageAccountsProcessed) {
            let mergedCol = (output["diagonisticStorageAccounts"] || (output["diagonisticStorageAccounts"] = [])).concat(storageSettings.processStorageSettings(value, parent));
            output.diagonisticStorageAccounts = mergedCol;
            diagonisticStorageAccountsProcessed = true;
        }
    },
    nics: (value, key, index, parent) => {
        let col = nicSettings.processNetworkInterfaceSettings(value, parent, index);

        let mergedCol = (output["nics"] || (output["nics"] = [])).concat(col.nics);
        output["nics"] = mergedCol;
        mergedCol = (output["pips"] || (output["pips"] = [])).concat(col.pips);
        output["pips"] = mergedCol;
    },
    availabilitySet: (value, key, index, parent) => {
        if (_.toLower(value.useExistingAvailabilitySet) === "no" && parent.vmCount === 1) {
            output["availabilitySet"] = [];
        } else if (!availabilitySetProcessed) {
            output["availabilitySet"] = avSetSettings.processAvSetSettings(value, parent);
        }
    },
    osDisk: (value, key, index, parent) => {
        if (_.toLower(value.osType) === "linux" && _.toLower(parent.osAuthenticationType) === "ssh") {
            output["secret"] = parent.sshPublicKey;
        } else {
            output["secret"] = parent.adminPassword;
        }
    },
}

function processVMStamps(param, buildingBlockSettings) {
    // resource template do not use the vmCount property. Remove from the template
    let vmCount = param.vmCount;
    param = resources.setupResources(param, buildingBlockSettings, (parentKey) => {
        return ((parentKey === null) || (parentKey === "virtualNetwork") || (parentKey === "availabilitySet") ||
            (parentKey === "nics") || (parentKey === "diagonisticStorageAccounts") || (parentKey === "storageAccounts") || (parentKey === "encryptionSettings"));
    });
    // deep clone settings for the number of VMs required (vmCount)  
    return _.transform(_.castArray(param), (result, n) => {
        for (let i = 0; i < vmCount; i++) {
            let stamp = _.cloneDeep(n);
            stamp.name = n.namePrefix.concat("-vm", i + 1)

            // delete namePrefix property since we wont need it anymore
            delete stamp.namePrefix;
            result.push(stamp);
        }
        return result;
    }, []);
}

function process(param, buildingBlockSettings) {
    output.virtualMachines = _.transform(processVMStamps(param, buildingBlockSettings), (result, n, index, parent) => {
        for (let prop in n) {
            if (typeof processChildResources[prop] === 'function') {
                processChildResources[prop](n[prop], prop, index, n);
            }
        }
        result.push(_.transform(n, (inner, value, key, obj) => {
            _.merge(inner, (typeof processorProperties[key] === 'function') ? processorProperties[key](value, key, index, obj) : processorProperties["passThrough"](value, key, index, obj));
            return inner;
        }, {}));
        return result;
    }, [])

    return createTemplateParameters(output);
};

function createTemplateParameters(resources) {
    let templateParameters = {
        $schema: "http://schema.management.azure.com/schemas/2015-01-01/deploymentParameters.json#",
        contentVersion: "1.0.0.0",
        parameters: {

        }
    };
    templateParameters.parameters = _.transform(resources, (result, value, key, obj) => {
        if (key === "secret" && !_.isString(value)) {
            result[key] = value;
        } else {
            result[key] = {};
            result[key].value = value;
        }
        return result;
    }, {});
    return templateParameters;
};

exports.processVirtualMachineSettings = process;
exports.mergeWithDefaults = merge;
exports.validateSettings = validate;
