import { LLRP, RfidReaderEvent } from './index.js';

import { ReaderConfig, TagInformation } from './interfaces/llrp.js';

// reader tcp/ip config
const config: ReaderConfig = {
    ipaddress: '192.168.1.53',
    port : 5084,
    autoStartScan: false,
    radioOperationConfig: {
        enableReadingTid: true,
        modeIndex: 1003,
        tagPopulation: 32,
        channelIndex: 1,
        inventorySearchMode: 2, // 1 - Single target (impinj custom parameter)
        antennasConfig: [
            { number: 1, power: 31.5 }, // 天线 1
            { number: 2, power: 31.5 }, // 天线 2
            { number: 3, power: 31.5 }, // 天线 3
            { number: 4, power: 31.5 }, // 天线 4
            { number: 5, power: 31.5 }, // 天线 4
            { number: 6, power: 31.5 }, // 天线 4
            { number: 7, power: 31.5 }, // 天线 4
            { number: 8, power: 31.5 }, // 天线 4
            { number: 9, power: 31.5 }, // 天线 4
            { number: 10, power: 31.5 }, // 天线 4
            { number: 11, power: 31.5 }, // 天线 4
            { number: 12, power: 31.5 }, // 天线 4
            { number: 13, power: 31.5 }, // 天线 4
            { number: 14, power: 31.5 }, // 天线 4
            { number: 15, power: 31.5 }, // 天线 4
            { number: 16, power: 31.5 }, // 天线 4
            { number: 17, power: 31.5 }, // 天线 4
            { number: 18, power: 31.5 }, // 天线 4
            { number: 19, power: 31.5 }, // 天线 4
            { number: 20, power: 31.5 }, // 天线 4
            { number: 21, power: 31.5 }, // 天线 4
            { number: 22, power: 31.5 }, // 天线 4
            { number: 23, power: 31.5 }, // 天线 4
            { number: 24, power: 31.5 }, // 天线 4
            { number: 25, power: 31.5 }, // 天线 4
            { number: 26, power: 31.5 }, // 天线 4
            { number: 27, power: 31.5 }, // 天线 4
            { number: 28, power: 31.5 }, // 天线 4
            { number: 29, power: 31.5 }, // 天线 4
            { number: 30, power: 31.5 }, // 天线 4
            { number: 31, power: 31.5 }, // 天线 4
            { number: 32, power: 31.5 } // 天线 4
        ]
    }
};

const reader: LLRP = new LLRP(config, undefined);

reader.connect();

reader.on(RfidReaderEvent.Timeout, () => {
    console.log('timeout');
});

reader.on(RfidReaderEvent.Disconnect, (error: Error) => {
    console.log('连接已断开:', error.message);
});

reader.on(RfidReaderEvent.Error, (error: any) => {
    console.log(`error: JSON.stringify(${ error })`);
});

reader.on(RfidReaderEvent.DisabledRadioOperation, () => {
    console.log('disabledRadioOperation');
});

reader.on(RfidReaderEvent.StartedRadioOperation, () => {
    console.log('startedRadioOperation');
});

reader.on(RfidReaderEvent.LlrpError, (error: Error) => {
    console.log('protocol error:', error);
});

reader.on(RfidReaderEvent.DidSeeTag, (tag: TagInformation) => {
    console.log(`Read: ${ tag.EPCData }`);
    // if (tag.EPC96) console.log('EPC96: ' + JSON.stringify(tag.EPC96));
    // if (tag.EPCData) console.log('EPCData: ' + JSON.stringify(tag.EPCData));
    // if (tag.TID) console.log('TID: ' + JSON.stringify(tag.TID));
});

reader.on(RfidReaderEvent.Connected, () => {
    setTimeout(() => {
        reader.enableRFTransmitter();
        console.log('RFID:enable rfid');
    }, 10000);

    setTimeout(() => {
        reader.disableRFTransmitter();
        console.log('RFID:disable rfid');
    }, 50000);
});



function normalExit(): void {
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
// process.on('uncaughtException', () => {
//     console.log('uncaughtException');
//     normalExit();
// });

// catches unhandled promise rejection
// process.on('unhandledRejection', () => {
//     console.log('unhandledRejection');
//     normalExit();
// });
