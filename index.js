// Imports
const Gpio = require('pigpio').Gpio;

// Constants
const DAT_PIN = new Gpio(10, {mode: Gpio.OUTPUT});
const CLK_PIN = new Gpio(11, {mode: Gpio.OUTPUT});
const LED_SOF = parseInt("11100000",2);
const LED_MAX_BR = parseInt("00011111",2);

const CHANNEL_PINS = [
    new Gpio(8, {mode: Gpio.OUTPUT}),
    new Gpio(7, {mode: Gpio.OUTPUT}),
    new Gpio(25, {mode: Gpio.OUTPUT}),
    new Gpio(24, {mode: Gpio.OUTPUT})
];

const NUM_PIXELS_PER_CHANNEL = 16;
const NUM_CHANNELS = 4;

const DEFAULT_BRIGHTNESS = 0.2;

// Variables
var _gamma_table = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2,
    2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5,
    6, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 11, 11,
    11, 12, 12, 13, 13, 13, 14, 14, 15, 15, 16, 16, 17, 17, 18, 18,
    19, 19, 20, 21, 21, 22, 22, 23, 23, 24, 25, 25, 26, 27, 27, 28,
    29, 29, 30, 31, 31, 32, 33, 34, 34, 35, 36, 37, 37, 38, 39, 40,
    40, 41, 42, 43, 44, 45, 46, 46, 47, 48, 49, 50, 51, 52, 53, 54,
    55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70,
    71, 72, 73, 74, 76, 77, 78, 79, 80, 81, 83, 84, 85, 86, 88, 89,
    90, 91, 93, 94, 95, 96, 98, 99,100,102,103,104,106,107,109,110,
    111,113,114,116,117,119,120,121,123,124,126,128,129,131,132,134,
    135,137,138,140,142,143,145,146,148,150,151,153,155,157,158,160,
    162,163,165,167,169,170,172,174,176,178,179,181,183,185,187,189,
    191,193,194,196,198,200,202,204,206,208,210,212,214,216,218,220,
    222,224,227,229,231,233,235,237,239,241,244,246,248,250,252,255]

var _white_point = {r:1, g:1, b:1};
var pixels = Array(NUM_CHANNELS).fill(Array(NUM_PIXELS_PER_CHANNEL).fill([0, 0, 0, DEFAULT_BRIGHTNESS]));
var channels = Array(NUM_CHANNELS).fill({pixels: NUM_PIXELS_PER_CHANNEL, gamma_correction: false});
var _gpio_setup = false;
var _clear_on_exit = false;

function _exit() {
    if (_clear_on_exit) {
        clear();
        show();
        //Do I need an equivalent to GPIO.cleanup()?    
    }
}

function setWhitePoint(red, green, blue) {
    _white_point = {r:red, g:green, b:blue};
}

function _set_gamma_table(table) {
    if (Array.isArray(table) && table.length == 256) {
        _gamma_table = table;
    }
}

function configureChannel(channel, num_pixels, gamma_correction=false) {
    channels[channel] = {pixels: num_pixels, gamma_correction: gamma_correction};
}

function getPixelCount(channel) {
    return channels[channel].pixels;
}

function setBrightness(brightness) {
    pixels.forEach(ch => ch.forEach(px => px[3] = brightness));
}

function clearChannel(channel) {
    pixels[channel].forEach(px => px.fill(0,0,2));
}

function clear() {
    for (var i=0; i< NUM_CHANNELS; i++) {
        clearChannel(i);
    }
}

function _select_channel(channel) {
    for (var i = 0; i < NUM_CHANNELS; i++) {
        if (i == channel) { CHANNEL_PINS[i].digitalWrite(0)}
        else {CHANNEL_PINS[i].digitalWrite(1)}
    }
}

function _write_byte(byte) {
    for (var i=0; i<8; i++) {
        DAT_PIN.digitalWrite(byte & 0b10000000);
        CLK_PIN.digitalWrite(1);
        byte << 1;
        CLK_PIN.digitalWrite(0);
    }
}

function _eof() {
    DAT_PIN.digitalWrite(0);
    for (var i = 0; i < 42; i++) {
        CLK_PIN.digitalWrite(1);
        CLK_PIN.digitalWrite(0);
    }
}

function _sof() {
    DAT_PIN.digitalWrite(0);
    for (var i = 0; i < 32; i++) {
        CLK_PIN.digitalWrite(1);
        CLK_PIN.digitalWrite(0);
    }
}

function show() {
    for (var i = 0; i < NUM_CHANNELS; i++) {
        _select_channel(i);
        gamma = _gamma_table;
        _sof();
        pixels[i].forEach(px => {
            var r = (px[0] * gamma[px[0]] * px[3] * _white_point.r) & 0xff;
            var g = (px[1] * gamma[px[1]] * px[3] * _white_point.g) & 0xff;
            var b = (px[2] * gamma[px[2]] * px[3] * _white_point.b) & 0xff;
            _write_byte(LED_SOF | LED_MAX_BR);
            _write_byte(b);
            _write_byte(g);
            _write_byte(r);
        });
        _eof();
    }
}

function setAll(r, g, b, brightness=null, channel=null) {
    if (channel === null) {
        for (var i = 0; i < NUM_CHANNELS; i++) {
            for (var j = 0; j < getPixelCount(i); j++) {
                setPixel(i, j, r, g, b, brightness);
            }
        }
    }
    else if (0<=channel && channel < NUM_CHANNELS) {
        for (var i = 0; i < getPixelCount(channel); i++) {
            setPixel(channel, i, r, g, b, brightness);
        }
    }
}

function getPixel(channel, index) {
    return {r: pixels[channel][index][0], g: pixels[channel][index][1], b: pixels[channel][index][2]};
}

function setPixel(channel, index, r, g, b, brightness=null) {
    if (brightness != null) {
        pixels[channel][index][3] = min(1,max(0,brightness));
    }
    pixels[channel][index][0] = r;
    pixels[channel][index][1] = g;
    pixels[channel][index][2] = b;
}

function setClearOnExit(value=true) {
    _clear_on_exit = value;
}

module.exports = {
    setWhitePoint,
    configureChannel,
    getPixelCount,
    setBrightness,
    clearChannel,
    clear,
    show,
    setAll,
    getPixel,
    setPixel,
    setClearOnExit
}