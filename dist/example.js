import { LLRP, RfidReaderEvent } from './index.js';
// reader tcp/ip config
const config = {
    ipaddress: '192.168.1.53',
    port: 5084,
    radioOperationConfig: {
        enableReadingTid: true,
        modeIndex: 1002,
        tagPopulation: 32,
        channelIndex: 1,
        inventorySearchMode: 2,
        antennasConfig: [
            { number: 1, power: 30 },
            { number: 2, power: 30 },
            { number: 3, power: 30 },
            { number: 4, power: 30 },
            { number: 5, power: 30 },
            { number: 6, power: 30 },
            { number: 7, power: 30 },
            { number: 8, power: 30 },
            { number: 9, power: 30 },
            { number: 10, power: 30 },
            { number: 11, power: 30 },
            { number: 12, power: 30 },
            { number: 13, power: 30 },
            { number: 14, power: 30 },
            { number: 15, power: 30 },
            { number: 16, power: 30 },
            { number: 17, power: 30 },
            { number: 18, power: 30 },
            { number: 19, power: 30 },
            { number: 20, power: 30 },
            { number: 21, power: 30 },
            { number: 22, power: 30 },
            { number: 23, power: 30 },
            { number: 24, power: 30 },
            { number: 25, power: 30 },
            { number: 26, power: 30 },
            { number: 27, power: 30 },
            { number: 28, power: 30 },
            { number: 29, power: 30 },
            { number: 30, power: 30 },
            { number: 31, power: 30 },
            { number: 32, power: 30 } // 天线 4
        ]
    }
};
const reader = new LLRP(config, console);
reader.connect();
reader.on(RfidReaderEvent.Timeout, () => {
    console.log('timeout');
});
reader.on(RfidReaderEvent.Disconnect, (error) => {
    console.log('disconnect', error);
});
reader.on(RfidReaderEvent.Error, (error) => {
    console.log(`error: JSON.stringify(${error})`);
});
reader.on(RfidReaderEvent.DisabledRadioOperation, () => {
    console.log('disabledRadioOperation');
});
reader.on(RfidReaderEvent.StartedRadioOperation, () => {
    console.log('startedRadioOperation');
});
reader.on(RfidReaderEvent.LlrpError, (error) => {
    console.log('protocol error:', error);
});
reader.on(RfidReaderEvent.DidSeeTag, (tag) => {
    console.log(`Read: ${JSON.stringify(tag)}`);
    // if (tag.EPC96) console.log('EPC96: ' + JSON.stringify(tag.EPC96));
    // if (tag.EPCData) console.log('EPCData: ' + JSON.stringify(tag.EPCData));
    // if (tag.TID) console.log('TID: ' + JSON.stringify(tag.TID));
});
setInterval(() => {
    reader.disableRFTransmitter();
    console.log('RFID:disable rfid');
}, 10000);
setTimeout(() => setInterval(() => {
    reader.enableRFTransmitter();
    console.log('RFID:enable rfid');
}, 10000), 5000);
function normalExit() {
    reader.disconnect();
    setTimeout(() => { process.exit(0); }, 1000);
}
process.on('SIGINT', () => {
    console.log('SIGINT');
    normalExit();
});
process.on('SIGQUIT', () => {
    console.log('SIGQUIT');
    normalExit();
});
process.on('SIGTERM', () => {
    console.log('SIGTERM');
    normalExit();
});
// catches uncaught exceptions
process.on('uncaughtException', () => {
    console.log('uncaughtException');
    normalExit();
});
// catches unhandled promise rejection
process.on('unhandledRejection', () => {
    console.log('unhandledRejection');
    normalExit();
});
//# sourceMappingURL=example.js.map