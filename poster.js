/**
 * PosterJS
 * 
 * Splits a large image into multiple tiles to print each of them on a separate sheet of paper.
 * The tile size calculation takes into account the paper aspect ratio and overlaps.
 *
 * Version 0.1 beta
 *
 * Copyright (C) 2015 Denis Volkov under the Apache License, Version 2.0
 * See LICENSE for details
 */

var im = require('imagemagick'); 
var parseArgs = require('minimist');
var inquirer = require('inquirer');

var PAPER_FORMATS = {
	LETTER: {
		title: 'Letter',
		// Width and height should be w/o margins (1/2" less)
		width: 8.0,
		height: 10.5
	},
	LEGAL: {
		title: 'Legal',
		width: 8.0,
		height: 13.5
	},
	LEDGER: {
		title: 'Ledger',
		width: 10.5,
		height: 16.5
	}
};

var OVERLAP = 0.1;

// Parsed arguments
var argv;
var landscapeMode = false;
var imageName;

// List of convert commands
var convertQueue = [];

function round(value, digits) {
	var multiply = Math.pow(10, digits);
	return Math.round(value * multiply) / multiply;
}

function identifyCallback(err, result) {
	if(err) {
		throw err;
	}

	var resArray = result.split(/\s+/);
	var imageWidth = parseInt(resArray[0]);
	var imageHeight = parseInt(resArray[1]);
	var imageRatio = imageHeight / imageWidth;
	console.log('Image ' + imageName + ' has dimensions ' + imageWidth + 'x' + imageHeight + 'px (1:' + round(imageRatio, 3) + ')');
	
	var paperFormat = PAPER_FORMATS.LETTER;
	var paperWidth = landscapeMode ? paperFormat.height : paperFormat.width;
	var paperHeight = landscapeMode ? paperFormat.width : paperFormat.height;
	var paperRatio = paperHeight / paperWidth;
	console.log('Using paper format ' + paperFormat.title + ' with print area dimensions ' + paperFormat.width + 'x'
		+ paperFormat.height + 'in (1:' + round(paperRatio, 3) + ') in '
		+ (landscapeMode ? 'landscape' : 'portrait') + ' orientation');

	var canvasWidth = paperWidth * argv.w - OVERLAP * (argv.w - 1);
	var canvasHeight = paperHeight * argv.h - OVERLAP * (argv.h - 1);
	var canvasRatio = canvasHeight / canvasWidth;
	console.log('Canvas size is ' + canvasWidth + 'x' + canvasHeight + 'in (1:' + round(canvasRatio, 3) + ')');

	var printDPI = (canvasRatio > imageRatio) ? (imageWidth / canvasWidth) : (imageHeight / canvasHeight);
	console.log('Print dimensions are ' + round(imageWidth / printDPI, 1) + 'x' + round(imageHeight / printDPI, 1) + 'in, ' + round(printDPI, 0) + 'dpi');

	var pixelOverlap = Math.round(OVERLAP * printDPI);
	var blockWidth = Math.round(printDPI * paperWidth);		// In pixels
	var blockHeight = Math.round(printDPI * paperHeight);
	var blockShiftX = blockWidth - pixelOverlap;
	var blockShiftY = blockHeight - pixelOverlap;
	var lastBlockWidth = (canvasRatio > imageRatio) ? blockWidth : (imageWidth - blockShiftX * (argv.w - 1));
	var lastBlockHeight = (canvasRatio > imageRatio) ? (imageHeight - blockShiftY * (argv.h - 1)) : blockHeight;

	var imageNameParts = imageName.match(/^(.+)(\.[^\.]+)$/);

	var x, y;
	for(y = 0; y < argv.h; ++ y) {
		for(x = 0; x < argv.w; ++ x) {
			convertQueue.push({
				name: imageNameParts[1] + '-' + y + '-' + x + imageNameParts[2],
				left: blockShiftX * x,
				top: blockShiftY * y,
				width: (x < argv.w - 1) ? blockWidth : lastBlockWidth,
				height: (y < argv.h - 1) ? blockHeight : lastBlockHeight
			});
		}
	}

	inquirer.prompt([{
		type: 'confirm',
		name: 'continue',
		message: 'Proceed?',
		default: false
	}], function(answers) {
		if(!answers.continue) {
			console.log('Exited by user\'s request');
			process.exit(255);
		}

		convertCallback(null);
	});

}

function convertCallback(err, stdout, stderr) {
	if(stdout) {
		console.log(stdout);
	}
	if(stderr) {
		console.error(stderr);
	}
	if(err) {
		throw err;
	}

	if(!convertQueue.length) {
		console.log('All done!');
		process.exit(0);
	}

	// Fetch the next task from the queue
	var task = convertQueue.splice(0, 1)[0];
	var convertArgs = [
		imageName,
		'-crop',
		task.width + 'x' + task.height + '+' + task.left + '+' + task.top,
		'+repage',
		task.name
	];
	console.log('Run convert ' + convertArgs.join(' '));

	im.convert(convertArgs, convertCallback);
}

function main(args) {
	argv = parseArgs(args);

	if(!argv._.length || !argv.w || !argv.h) {
		console.warn('Usage: node proster.js -w width -h height [-o {p|l}] imagefile');
		process.exit(0);
	}

	landscapeMode = (argv.o && String(argv.o).toLowerCase() == 'l');

	imageName = argv._[0];
	im.identify(['-format', '%w %h', imageName], identifyCallback);
}

main(process.argv.slice(2));
