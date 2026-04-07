/**
 * Low Level Reader Protocol  (LLRP) standard https://www.gs1.org/sites/default/files/docs/epc/llrp_1_1-standard-20101013.pdf
 * LLRP Messages and Reader Actions are descibed at page 42 of the standard.
 *
 * TODO: Ask GET_READER_CAPABILITIES and proccess GET_READER_CAPABILITIES_RESPONSE
 */
import * as net from 'net';
import { EventEmitter } from 'events';
import Int64 from 'node-int64';
import parameterC from './parametersConstants';
import { LLRPMessage } from './messages';
import { decodeMessage, decodeParameter } from './decode';
import { GetLlrpMessage } from './getLlrpMessage';
import { RfidReaderEvent } from './interfaces/llrp';
import { MessagesType } from './interfaces/messagesType';
import { CustomParameterSubType } from './interfaces/parameters';
export * from './interfaces/llrp';
const defaultRoSpecId = 1;
export class LLRP extends EventEmitter {
    constructor(config, logger) {
        super();
        this.logger = logger;
        this.port = 5084;
        this.isReaderConfigSet = false;
        this.isStartROSpecSent = false;
        this.isReaderConfigReset = false;
        this.allReaderRospecDeleted = false;
        this.allReaderAccessSpecDeleted = false;
        this.isExtensionsEnabled = false;
        this.sendEnableRospecOnceMore = true;
        this.radioOperationConfig = {};
        this.enableTransmitter = true;
        this.socket = new net.Socket();
        this.client = null;
        this.connected = false;
        // TODO: make a default config with a default value and then merge DB config with default
        this.ipaddress = config.ipaddress;
        this.port = config.port || this.port;
        this.radioOperationConfig = config.radioOperationConfig;
        this.radioOperationConfig.antennasConfig = config.radioOperationConfig.antennasConfig || [];
        this.radioOperationConfig.enableReadingTid = config.radioOperationConfig.enableReadingTid || false;
        this.isReaderConfigSet = config.isReaderConfigSet || this.isReaderConfigSet;
        this.isStartROSpecSent = config.isStartROSpecSent || this.isStartROSpecSent;
        this.isReaderConfigReset = config.isReaderConfigReset || this.isReaderConfigReset;
    }
    connect() {
        this.connected = true;
        this.enableTransmitter = true;
        // timeout after 60 seconds.
        this.socket.setTimeout(60000, () => {
            if (this.connected) {
                this.log('Connection timeout');
                process.nextTick(() => {
                    this.connected = false;
                    this.emit(RfidReaderEvent.Timeout, new Error('Connection timeout'));
                });
            }
        });
        // connect with reader
        this.client = this.socket.connect(this.port, this.ipaddress, () => {
            this.log(`Connected to ${this.ipaddress}:${this.port}`);
            process.nextTick(() => {
                this.emit(RfidReaderEvent.Connected);
            });
        });
        // whenever reader sends data.
        this.client.on('data', (data) => {
            this.handleReceivedData(data);
        });
        // // the reader or client has ended the connection.
        this.client.on('end', () => {
            // the session has ended
            this.log('client disconnected');
            process.nextTick(() => {
                this.connected = false;
                this.emit(RfidReaderEvent.Disconnect, new Error('Client disconnected.'));
            });
        });
        // cannot connect to the reader other than a timeout.
        this.client.on('error', (err) => {
            // error on the connection
            this.log(err);
            process.nextTick(() => {
                this.connected = false;
                this.emit(RfidReaderEvent.Error, err);
            });
        });
    }
    disconnect() {
        if (this.socket.destroyed) {
            return false;
        }
        this.connected = false;
        this.sendMessage(this.client, GetLlrpMessage.deleteRoSpec(defaultRoSpecId));
        this.resetIsStartROSpecSent();
        return true;
    }
    disableRFTransmitter() {
        if (this.socket.destroyed) {
            return false;
        }
        this.enableTransmitter = false;
        this.sendMessage(this.client, GetLlrpMessage.disableRoSpec(defaultRoSpecId));
        this.resetIsStartROSpecSent();
        return true;
    }
    enableRFTransmitter() {
        if (this.socket.destroyed) {
            return false;
        }
        this.enableTransmitter = true;
        this.sendEnableRospec(true);
        return true;
    }
    log(...args) {
        if (this.logger) {
            this.logger.debug('LLRP:', ...args);
        }
    }
    handleReceivedData(data) {
        process.nextTick(() => {
            // check if there is data.
            if (!data) {
                this.log('Undefined data returned by the rfid reader.');
            }
            // decoded message(s), passable to LLRPMessage class.
            const messagesKeyValue = decodeMessage(data);
            // loop through the message.
            for (const index in messagesKeyValue) {
                // possible we have more than 1 message in a reply.
                const message = new LLRPMessage(messagesKeyValue[index]);
                this.log(`Receiving: ${message.getTypeName()}`);
                this.checkErrorInResponse(message);
                // Check message type and send appropriate response.
                // This send-receive is the most basic form to read a tag in llrp.
                switch (message.getType()) {
                    // TODO:
                    // case messageC.GET_READER_CONFIG_RESPONSE:
                    //      handleGetReaderConfig(message);
                    //      break;
                    case MessagesType.READER_EVENT_NOTIFICATION:
                        this.handleReaderNotification(message);
                        break;
                    case MessagesType.DELETE_ACCESSSPEC_RESPONSE:
                    case MessagesType.SET_READER_CONFIG_RESPONSE:
                    case MessagesType.CUSTOM_MESSAGE:
                        this.handleReaderConfiguration();
                        break;
                    case MessagesType.ADD_ROSPEC_RESPONSE:
                        this.sendEnableRospec(true);
                        break;
                    case MessagesType.ENABLE_ROSPEC_RESPONSE:
                        if (this.sendEnableRospecOnceMore) {
                            this.sendEnableRospec(false);
                        }
                        else {
                            this.sendStartROSpec();
                        }
                        break;
                    case MessagesType.DISABLE_ROSPEC_RESPONSE:
                        if (!this.lastLlrpStatusCode) {
                            this.emit(RfidReaderEvent.DisabledRadioOperation);
                        }
                        break;
                    case MessagesType.DELETE_ROSPEC_RESPONSE:
                        if (!this.allReaderRospecDeleted) {
                            this.allReaderRospecDeleted = true;
                            this.handleReaderConfiguration();
                        }
                        else {
                            this.sendMessage(this.client, GetLlrpMessage.closeConnection());
                        }
                        break;
                    case MessagesType.START_ROSPEC_RESPONSE:
                        if (!this.lastLlrpStatusCode) {
                            this.emit(RfidReaderEvent.StartedRadioOperation);
                        }
                        this.sendMessage(this.client, GetLlrpMessage.enableEventsAndReport());
                        break;
                    case MessagesType.RO_ACCESS_REPORT:
                        this.handleROAccessReport(message);
                        break;
                    case MessagesType.KEEPALIVE:
                        this.sendMessage(this.client, GetLlrpMessage.keepAliveAck());
                        break;
                    default:
                        // Default, doing nothing.
                        this.log(`default: ${message.getTypeName()}`);
                }
            }
        });
    }
    checkErrorInResponse(message) {
        const param = decodeParameter(message.getParameter());
        if (!param) {
            return;
        }
        param.forEach((decodedParameters) => {
            // read LLRPStatus Parameter only.
            if (decodedParameters.type === parameterC.LLRPStatus) {
                const statusCode = decodedParameters.value.readInt16BE(0);
                if (statusCode) {
                    const errorDescriptionByteCount = decodedParameters.value.readInt16BE(2);
                    const errorDescriptionBuffer = Buffer.allocUnsafe(errorDescriptionByteCount);
                    decodedParameters.value.copy(errorDescriptionBuffer, 0, 4, errorDescriptionByteCount + 4);
                    const errorDescription = `${errorDescriptionBuffer.toString('utf8')} in ${message.getTypeName()}`;
                    this.emit(RfidReaderEvent.LlrpError, new Error(`${statusCode}: ${errorDescription}`));
                }
                this.lastLlrpStatusCode = statusCode;
            }
        });
    }
    handleReaderNotification(message) {
        const parametersKeyValue = decodeParameter(message.getParameter());
        parametersKeyValue.forEach((decodedParameters) => {
            if (decodedParameters.type === parameterC.ReaderEventNotificationData) {
                const subParameters = this.mapSubParameters(decodedParameters);
                if (subParameters[parameterC.ROSpecEvent]) {
                    // Event type is End of ROSpec
                    if (subParameters[parameterC.ROSpecEvent].readUInt8(0) === 1) {
                        // We only have 1 ROSpec so obviously it would be that.
                        // So we would not care about the ROSpecID and
                        // just reset flag for START_ROSPEC.
                        this.resetIsStartROSpecSent();
                    }
                }
            }
        });
        if (!this.enableTransmitter) {
            return;
        }
        // global configuration and enabling reports has not been set.
        if (!this.isReaderConfigReset) { // reset them.
            this.client.write(GetLlrpMessage.resetConfigurationToFactoryDefaults());
            this.isReaderConfigReset = true; // we have reset the reader configuration.
        }
        else {
            this.sendStartROSpec();
        }
    }
    handleReaderConfiguration() {
        if (!this.allReaderAccessSpecDeleted) {
            this.sendMessage(this.client, GetLlrpMessage.deleteAllAccessSpec());
            this.allReaderAccessSpecDeleted = true;
        }
        else if (!this.allReaderRospecDeleted) {
            this.sendMessage(this.client, GetLlrpMessage.deleteAllROSpecs());
        }
        else if (!this.isExtensionsEnabled) {
            // enable extensions for impinj reader
            this.sendMessage(this.client, GetLlrpMessage.enableExtensions());
            this.isExtensionsEnabled = true;
        }
        else if (!this.isReaderConfigSet) { // set them.
            this.sendMessage(this.client, GetLlrpMessage.setReaderConfig()); // send SET_READER_CONFIG, global reader configuration in reading tags.
            this.isReaderConfigSet = true; // we have set the reader configuration.
        }
        else {
            this.sendMessage(this.client, GetLlrpMessage.addRoSpec(defaultRoSpecId, this.radioOperationConfig));
        }
    }
    handleROAccessReport(message) {
        process.nextTick(() => {
            // show current date.
            this.log(`RO_ACCESS_REPORT at ${(new Date()).toString()}`);
            // read Parameters
            // this contains the TagReportData
            const parametersKeyValue = decodeParameter(message.getParameter());
            if (parametersKeyValue) {
                parametersKeyValue.forEach((decodedParameters) => {
                    // read TagReportData Parameter only.
                    if (decodedParameters.type === parameterC.TagReportData) {
                        const tag = {};
                        const subParameters = this.mapSubParameters(decodedParameters);
                        if (subParameters[parameterC.EPC96]) {
                            tag.EPC96 = subParameters[parameterC.EPC96].toString('hex');
                        }
                        if (subParameters[parameterC.EPCData]) {
                            tag.EPCData = subParameters[parameterC.EPCData].toString('hex');
                        }
                        if (subParameters[parameterC.AntennaID]) {
                            tag.antennaID = subParameters[parameterC.AntennaID].readUInt16BE(0);
                        }
                        if (subParameters[parameterC.TagSeenCount]) {
                            tag.tagSeenCount = subParameters[parameterC.TagSeenCount].readUInt16BE(0);
                        }
                        if (subParameters[parameterC.PeakRSSI]) {
                            tag.peakRSSI = subParameters[parameterC.PeakRSSI].readInt8(0);
                        }
                        if (subParameters[parameterC.ROSpecID]) {
                            tag.roSpecID = subParameters[parameterC.ROSpecID].readUInt32BE(0);
                        }
                        if (subParameters[parameterC.SpecIndex]) {
                            tag.specIndex = subParameters[parameterC.SpecIndex].readUInt16BE(0);
                        }
                        if (subParameters[parameterC.InventoryParameterSpecID]) {
                            tag.inventoryParameterSpecID = subParameters[parameterC.InventoryParameterSpecID].readUInt16BE(0);
                        }
                        if (subParameters[parameterC.ChannelIndex]) {
                            tag.channelIndex = subParameters[parameterC.ChannelIndex].readUInt16BE(0);
                        }
                        if (subParameters[parameterC.C1G2PC]) {
                            tag.C1G2PC = subParameters[parameterC.C1G2PC].readUInt16BE(0);
                        }
                        if (subParameters[parameterC.C1G2CRC]) {
                            tag.C1G2CRC = subParameters[parameterC.C1G2CRC].readUInt16BE(0);
                        }
                        if (subParameters[parameterC.AccessSpecID]) {
                            tag.accessSpecID = subParameters[parameterC.AccessSpecID].readUInt32BE(0);
                        }
                        if (subParameters[parameterC.FirstSeenTimestampUTC]) {
                            // Note: Here is losing precision because JS numbers are defined to be double floats
                            const firstSeenTimestampUTCus = new Int64(subParameters[parameterC.FirstSeenTimestampUTC], 0);
                            tag.firstSeenTimestampUTC = firstSeenTimestampUTCus.toNumber(true); // microseconds
                        }
                        if (subParameters[parameterC.LastSeenTimestampUTC]) {
                            // Note: Here is losing precision because JS numbers are defined to be double floats
                            const lastSeenTimestampUTCus = new Int64(subParameters[parameterC.LastSeenTimestampUTC], 0);
                            tag.lastSeenTimestampUTC = lastSeenTimestampUTCus.toNumber(true); // microseconds
                        }
                        if (subParameters[parameterC.Custom]) {
                            tag.custom = subParameters[parameterC.Custom].toString('hex');
                            if (this.radioOperationConfig.enableReadingTid && this.isExtensionsEnabled) {
                                // parse impinj parameter
                                const impinjParameterSubtype = subParameters[parameterC.Custom].readUInt32BE(4);
                                switch (impinjParameterSubtype) {
                                    case CustomParameterSubType.IMPINJ_SERIALIZED_TID:
                                        tag.TID = subParameters[parameterC.Custom].toString('hex', 10);
                                        break;
                                }
                            }
                        }
                        this.log(`\tEPCData: ${tag.EPCData} \tEPC96: ${tag.EPC96} \tTID: ${tag.TID} \tRead count: ${tag.tagSeenCount} \tAntenna ID: ${tag.antennaID} \tLastSeenTimestampUTC: ${tag.lastSeenTimestampUTC}`);
                        if (tag.TID || tag.EPCData || tag.EPC96) {
                            process.nextTick(() => {
                                this.emit(RfidReaderEvent.DidSeeTag, tag);
                            });
                        }
                    }
                });
            }
        });
    }
    /**
     * Send message to rfid and write logs.
     *
     * @param  {[type]} client  rfid connection.
     * @param  {Buffer} buffer  to write.
     */
    sendMessage(client, buffer) {
        if (!client || (client && client.destroyed)) {
            return;
        }
        process.nextTick(() => {
            this.log(`Sending ${this.getMessageName(buffer)}`);
            this.client.write(buffer);
        });
    }
    /**
     * Gets the name of the message using the encoded Buffer.
     *
     * @param  {Buffer} data
     * @return {string} name of the message
     */
    getMessageName(data) {
        // get the message code
        // get the name from the constants.
        return MessagesType[this.getMessage(data)];
    }
    /**
     * Gets the message type using the encoded Buffer.
     *
     * @param  {Buffer} data
     * @return {int} corresponding message type code.
     */
    getMessage(data) {
        // message type resides on the first 2 bits of the first octet
        // and 8 bits of the second octet.
        return (data[0] & 3) << 8 | data[1];
    }
    sendEnableRospec(sendTwoTimes) {
        this.sendEnableRospecOnceMore = sendTwoTimes ? true : false;
        this.sendMessage(this.client, GetLlrpMessage.enableRoSpec(defaultRoSpecId));
    }
    /**
     * Sends a START_ROSPEC message if it has not been sent.
     *
     * @return {Int} returns the length written or false if there was an error writing.
     */
    sendStartROSpec() {
        // START_ROSPEC has not been sent.
        if (!this.isStartROSpecSent) {
            this.isStartROSpecSent = true; // change state of flag.
            this.sendMessage(this.client, GetLlrpMessage.startRoSpec(defaultRoSpecId));
        }
    }
    /**
     * Resets the isStartROSpecSent flag to false.
     */
    resetIsStartROSpecSent() {
        this.isStartROSpecSent = false;
    }
    /**
     * Simple helper function to map key value pairs using the typeName and value.
     * Probably should be built in with LLRPParameter class.
     *
     * @param  {Object} decodedParameters  object returned from decode.parameter.
     * @return {Object}  the key value pair.
     */
    mapSubParameters(decodedParameters) {
        // create an object that will hold a key valuemapSubParameters pair.
        const properties = {};
        const subP = decodedParameters.subParameters;
        for (const tag in subP) {
            // where key is the Parameter type.
            // and value is the Parameter value as Buffer object.
            properties[subP[tag].type] = subP[tag].value;
        }
        return properties;
    }
}
//# sourceMappingURL=index.js.map