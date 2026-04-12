/**
 * Low Level Reader Protocol  (LLRP) standard https://www.gs1.org/sites/default/files/docs/epc/llrp_1_1-standard-20101013.pdf
 * Binary Encoding for LLRP are descibed at page 125 of the standard.
 */
import parameterC from './parametersConstants.js';
import { rospecConstants } from './rospecConstants.js';
import { LLRPParameter } from './parameters.js';
import { LLRPMessage } from './messages.js';
import { encodeMessage, encodeParameter } from './encode.js';
import { MessagesType } from './interfaces/messagesType.js';
const vendorId = rospecConstants.impinjVendorId;
const MAX_RFID_POWER_FOR_THE_EU = 31.50; // dBm
export class GetLlrpMessage {
    static resetConfigurationToFactoryDefaults() {
        return this.makeMessage(MessagesType.SET_READER_CONFIG, 1205, new Buffer([0x80]));
    }
    static setReaderConfig() {
        const holdEventsAndReportsUponReconnect = 0x80;
        const eventsAndReportsParameter = Buffer.allocUnsafe(1);
        eventsAndReportsParameter.writeUInt8(holdEventsAndReportsUponReconnect, 0);
        const eventsAndReports = this.makeTLVParameter(parameterC.EventsAndReports, eventsAndReportsParameter);
        const restoreFactorySettings = 0x00;
        const setReaderConfigParameter = Buffer.allocUnsafe(1);
        setReaderConfigParameter.writeUInt8(restoreFactorySettings, 0);
        return this.makeMessage(MessagesType.SET_READER_CONFIG, 0, Buffer.concat([setReaderConfigParameter, eventsAndReports]));
    }
    static addRoSpec(roSpecID, parameters) {
        const rOSpecStartTriggerParams = Buffer.allocUnsafe(5);
        rOSpecStartTriggerParams.writeUInt8(rospecConstants.ROSpecStopTriggerType, 0);
        rOSpecStartTriggerParams.writeUInt32BE(rospecConstants.DurationTriggerValue, 1);
        const rOSpecStartTrigger = this.makeTLVParameter(parameterC.ROSpecStartTrigger, new Buffer([rospecConstants.ROSpecStartTriggerType]));
        const rOSpecStopTrigger = this.makeTLVParameter(parameterC.ROSpecStopTrigger, rOSpecStartTriggerParams);
        const totalLengthRo = rOSpecStartTrigger.length + rOSpecStopTrigger.length;
        const rOBoundarySpec = this.makeTLVParameter(parameterC.ROBoundarySpec, Buffer.concat([rOSpecStartTrigger, rOSpecStopTrigger], totalLengthRo));
        // AISpec parameter includes parameters inside like a Matryoshka doll
        // |-AISpec
        //   |--AI Spec Stop
        //   |--Inventory Parameter Spec ID
        //   |---Antenna Configuration
        //       ....
        //   |---Antenna Configuration
        //   |----RF Receiver
        //   |----RF Transmitter
        //   |----G1G2 Inventory Command
        //   |-----C1G2 RF Control
        //   |-----C1G2 Singulation Control
        let aiSpecParams;
        const antennaCount = parameters.antennasConfig.length;
        const сonfigEachAntenna = !!(parameters.antennasConfig && antennaCount);
        if (сonfigEachAntenna) {
            // set active antennas from config
            aiSpecParams = Buffer.allocUnsafe(antennaCount * 2 + 2);
            aiSpecParams.writeUInt16BE(antennaCount, 0);
            parameters.antennasConfig.forEach((config, index) => {
                aiSpecParams.writeUInt16BE(config.number, (index + 1) * 2);
            });
        }
        else {
            // set all active antennas
            aiSpecParams = Buffer.allocUnsafe(4);
            aiSpecParams.writeUInt16BE(rospecConstants.AntennaCount, 0);
            aiSpecParams.writeUInt16BE(rospecConstants.AntennaId, 2);
        }
        const aiSpecStopTriggerParams = Buffer.allocUnsafe(5);
        aiSpecStopTriggerParams.writeUInt8(rospecConstants.AISpecStopTriggerType, 0);
        aiSpecStopTriggerParams.writeUInt32BE(rospecConstants.AISpecStopDurationTriggerValue, 1);
        const aiSpecStopTrigger = this.makeTLVParameter(parameterC.AISpecStopTrigger, aiSpecStopTriggerParams);
        let antennaConfiguration = GetLlrpMessage.getAntennaConfig(0, this.getAntennaTransmitPowerIndex(MAX_RFID_POWER_FOR_THE_EU), 1, 1, 3, 4);
        const protocolId = rospecConstants.EPCGlobalClass1Gen2;
        const inventoryParameterSpecParams = Buffer.allocUnsafe(3 + (antennaConfiguration.length * antennaCount));
        inventoryParameterSpecParams.writeUInt16BE(rospecConstants.inventoryParameterSpecId, 0);
        inventoryParameterSpecParams.writeUInt8(protocolId, 2);
        if (сonfigEachAntenna) {
            parameters.antennasConfig.forEach((config, index) => {
                antennaConfiguration = GetLlrpMessage.getAntennaConfig(config.number, this.getAntennaTransmitPowerIndex(config.power), parameters.channelIndex, parameters.inventorySearchMode, parameters.modeIndex, parameters.tagPopulation);
                antennaConfiguration.copy(inventoryParameterSpecParams, (index * antennaConfiguration.length) + 3);
            });
        }
        const inventoryParameterSpec = this.makeTLVParameter(parameterC.InventoryParameterSpec, inventoryParameterSpecParams);
        const aiSpec = this.makeTLVParameter(parameterC.AISpec, Buffer.concat([aiSpecParams, aiSpecStopTrigger, inventoryParameterSpec]));
        // ROReportSpec parameter includes 2 parameters inside like a Matryoshka doll
        // |-ROReportSpec
        //   |--TagReportContentSelector
        //     |---C1G2EPCMemorySelector
        // if enableReadingTid === true then
        //   |--CustomParameter (Impinj - Tag report content selector)
        //     |---CustomParameter (Impinj - Enable serialized TID)
        const c1G2EPCMemorySelectorParam = Buffer.allocUnsafe(1);
        c1G2EPCMemorySelectorParam.writeUInt8(rospecConstants.enableCRC | rospecConstants.enablePCbits, 0);
        const c1G2EPCMemorySelector = this.makeTLVParameter(parameterC.C1G2EPCMemorySelector, c1G2EPCMemorySelectorParam);
        const tagReportContentSelectorBits = rospecConstants.enableROSpecID
            | rospecConstants.enableSpecIndex
            | rospecConstants.enableInventoryParameterSpecID
            | rospecConstants.enableAntennaID
            | rospecConstants.enableChannelIndex
            | rospecConstants.enablePeakRSSI
            | rospecConstants.enableFirstSeenTimestamp
            | rospecConstants.enableLastSeenTimestamp
            | rospecConstants.enableTagSeenCount
            | rospecConstants.enableAccessSpecID;
        const tagReportContentSelectorParameter = Buffer.allocUnsafe(2);
        tagReportContentSelectorParameter.writeUInt16BE(tagReportContentSelectorBits, 0);
        const tagReportContentSelectorParameters = Buffer.concat([tagReportContentSelectorParameter, c1G2EPCMemorySelector]);
        const tagReportContentSelector = this.makeTLVParameter(parameterC.TagReportContentSelector, tagReportContentSelectorParameters);
        // custom parameter for impinj reader to enable TID number
        const enableSerializedTidParams = Buffer.allocUnsafe(10);
        const impinjSubParameterEnableSerializedTid = 0x33; // 51
        const serializedTidMode = 0x01;
        enableSerializedTidParams.writeUInt32BE(vendorId, 0);
        enableSerializedTidParams.writeUInt32BE(impinjSubParameterEnableSerializedTid, 4);
        enableSerializedTidParams.writeUInt16BE(serializedTidMode, 8);
        const enableSerializedTid = this.makeTLVParameter(parameterC.Custom, enableSerializedTidParams);
        // custom parameter for impinj reader
        const tagReportContentSelectorParams = Buffer.allocUnsafe(22);
        const TAG_REPORT_CONTENT_SELECTOR = 0x32; // 50
        const impinjParameterSubType = TAG_REPORT_CONTENT_SELECTOR;
        tagReportContentSelectorParams.writeUInt32BE(vendorId, 0);
        tagReportContentSelectorParams.writeUInt32BE(impinjParameterSubType, 4);
        tagReportContentSelectorParams.fill(enableSerializedTid, 8);
        const customParamImpinjTagReportContentSelector = this.makeTLVParameter(parameterC.Custom, tagReportContentSelectorParams);
        const rOReportSpecParams = Buffer.allocUnsafe(3);
        rOReportSpecParams.writeUInt8(rospecConstants.ROreportTrigger, 0);
        rOReportSpecParams.writeUInt16BE(rospecConstants.N, 1);
        const paramsBuffer = [rOReportSpecParams, tagReportContentSelector];
        if (parameters.enableReadingTid) {
            paramsBuffer.push(customParamImpinjTagReportContentSelector);
        }
        const rOReportSpec = this.makeTLVParameter(parameterC.ROReportSpec, Buffer.concat(paramsBuffer));
        const rOSpecIDParameters = Buffer.allocUnsafe(6);
        rOSpecIDParameters.writeUInt32BE(roSpecID, 0);
        rOSpecIDParameters.writeUInt8(rospecConstants.Priority, 4);
        rOSpecIDParameters.writeUInt8(rospecConstants.CurrentState, 5);
        const addRospecData = this.makeTLVParameter(parameterC.ROSpec, Buffer.concat([rOSpecIDParameters, rOBoundarySpec, aiSpec, rOReportSpec]));
        const answer = this.makeMessage(MessagesType.ADD_ROSPEC, 4, addRospecData);
        return answer;
    }
    static enableEventsAndReport() {
        return this.makeMessage(MessagesType.ENABLE_EVENTS_AND_REPORTS, 0);
    }
    static enableRoSpec(roSpecID) {
        return this.makeMessage(MessagesType.ENABLE_ROSPEC, 0, this.getUint32Parameter(roSpecID));
    }
    static startRoSpec(roSpecID) {
        return this.makeMessage(MessagesType.START_ROSPEC, 0, this.getUint32Parameter(roSpecID));
    }
    static disableRoSpec(roSpecID) {
        return this.makeMessage(MessagesType.DISABLE_ROSPEC, 0, this.getUint32Parameter(roSpecID));
    }
    static deleteAllRoSpec() {
        return this.deleteRoSpec(0);
    }
    static deleteRoSpec(roSpecID) {
        return this.makeMessage(MessagesType.DELETE_ROSPEC, 0, this.getUint32Parameter(roSpecID));
    }
    static deleteAllAccessSpec() {
        return this.makeMessage(MessagesType.DELETE_ACCESSSPEC, 0, this.getUint32Parameter(0));
    }
    static deleteAllROSpecs() {
        return this.makeMessage(MessagesType.DELETE_ROSPEC, 0, this.getUint32Parameter(0));
    }
    // custom message to enable reader extensions for impinj reader
    static enableExtensions() {
        const enableExtensionsParams = Buffer.allocUnsafe(9);
        const subType = 0x15; // 21 - Enable Extensions
        const reserved = 0;
        enableExtensionsParams.writeUInt32BE(vendorId, 0);
        enableExtensionsParams.writeUInt8(subType, 4);
        enableExtensionsParams.writeUInt32BE(reserved, 5);
        return this.makeMessage(MessagesType.CUSTOM_MESSAGE, 1, enableExtensionsParams);
    }
    static keepAliveAck() {
        return this.makeMessage(MessagesType.KEEPALIVE_ACK, 0);
    }
    static closeConnection() {
        return this.makeMessage(MessagesType.CLOSE_CONNECTION, 0);
    }
    static makeTLVParameter(parameterType, parameterValue) {
        const parameter = {};
        parameter.type = parameterType;
        parameter.value = parameterValue;
        parameter.length = parameter.value.length + 4;
        parameter.reserved = 0;
        return encodeParameter(new LLRPParameter(parameter));
    }
    static makeMessage(messageType, messageId, messageParameters) {
        const message = {};
        message.type = messageType;
        message.length = 0;
        if (messageParameters)
            message.parameter = messageParameters;
        const messageStruct = new LLRPMessage(message);
        messageStruct.setVersion(1);
        messageStruct.setID(messageId);
        return encodeMessage(messageStruct);
    }
    static getUint32Parameter(value) {
        const parameter = Buffer.allocUnsafe(4);
        parameter.writeUInt32BE(value, 0);
        return parameter;
    }
    static getAntennaTransmitPowerIndex(transmitPowerValue) {
        // TODO: get this power index from GET_READER_CAPABILITIES_RESPONSE
        return ((transmitPowerValue - 10.0) / 0.25) + 1;
    }
    static getAntennaConfig(antennaId, transmitPowerValue, channelIndex, inventorySearchMode, modeIndex, tagPopulation) {
        const rfReceiverParam = Buffer.allocUnsafe(2);
        rfReceiverParam.writeUInt16BE(rospecConstants.rfSensitivity, 0);
        const rfReceiver = this.makeTLVParameter(parameterC.RFReceiver, rfReceiverParam);
        const rfTransmitterParams = Buffer.allocUnsafe(6);
        rfTransmitterParams.writeUInt16BE(rospecConstants.hopTableId, 0);
        rfTransmitterParams.writeUInt16BE(channelIndex, 2);
        rfTransmitterParams.writeUInt16BE(transmitPowerValue, 4);
        const rfTransmitter = this.makeTLVParameter(parameterC.RFTransmitter, rfTransmitterParams);
        const c1g2RfControlParams = Buffer.allocUnsafe(4);
        c1g2RfControlParams.writeUInt16BE(modeIndex, 0);
        c1g2RfControlParams.writeUInt16BE(rospecConstants.tari, 2);
        const c1g2RfControl = this.makeTLVParameter(parameterC.C1G2RFControl, c1g2RfControlParams);
        const c1g2SingulationControlParams = Buffer.allocUnsafe(7);
        c1g2SingulationControlParams.writeUInt8(rospecConstants.session, 0);
        c1g2SingulationControlParams.writeUInt16BE(tagPopulation, 1);
        c1g2SingulationControlParams.writeUInt32BE(rospecConstants.tagTranzitTime, 3);
        const c1g2SingulationControl = this.makeTLVParameter(parameterC.C1G2SingulationControl, c1g2SingulationControlParams);
        // custom parameter for impinj reader
        const inventorySearchModeParams = Buffer.allocUnsafe(10);
        const INVENTORY_SEARCH_MODE_COMMAND = 0x17; // 23
        const impinjParameterSubType = INVENTORY_SEARCH_MODE_COMMAND;
        inventorySearchModeParams.writeUInt32BE(vendorId, 0);
        inventorySearchModeParams.writeUInt32BE(impinjParameterSubType, 4);
        inventorySearchModeParams.writeUInt16BE(inventorySearchMode, 8);
        const customParamImpinjInventorySearchMode = this.makeTLVParameter(parameterC.Custom, inventorySearchModeParams);
        const c1g2InventoryCommandParam = Buffer.allocUnsafe(1);
        c1g2InventoryCommandParam.writeUInt8(rospecConstants.tagInventoryStateAwareNo, 0);
        const paramsBuffer = [c1g2InventoryCommandParam, c1g2RfControl, c1g2SingulationControl];
        // TODO: customParamImpinjInventorySearchMode is for impinj reader.
        if (true) {
            paramsBuffer.push(customParamImpinjInventorySearchMode);
        }
        const c1g2InventoryCommand = this.makeTLVParameter(parameterC.C1G2InventoryCommand, Buffer.concat(paramsBuffer));
        const antennaConfigurationParam = Buffer.allocUnsafe(2);
        antennaConfigurationParam.writeUInt16BE(antennaId, 0);
        const antennaConfiguration = this.makeTLVParameter(parameterC.AntennaConfiguration, Buffer.concat([antennaConfigurationParam, rfReceiver, rfTransmitter, c1g2InventoryCommand]));
        return antennaConfiguration;
    }
}
//# sourceMappingURL=getLlrpMessage.js.map