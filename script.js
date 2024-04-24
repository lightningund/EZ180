// TODO:
// X Allow user to change the fov
// X Allow user to change canvas resolution
// X Mute and hide video controls
// X Figure out a way to save an entire video
// Don't accumulate canvas objects
// Figure out a better way to save the canvas
// Add manual progress bar to show video progress
// Try to make the video processing happen faster than 1x?

let W_LIM = 500;
let H_FOV = 81;

// Testing for and setting up WebGPU
if (!navigator.gpu) throw Error("WebGPU not supported");
const adapter = await navigator.gpu.requestAdapter();
if (!adapter) throw Error("Couldn't request WebGPU Adapter");
const device = await adapter.requestDevice();
if (!device) throw Error("Couldn't request WebGPU Device");

const format = navigator.gpu.getPreferredCanvasFormat();

const shader_mod = device.createShaderModule({ code: shaders });

const pipeline = device.createRenderPipeline({
	vertex: {
		module: shader_mod,
		entryPoint: "vertex_main"
	},
	fragment: {
		module: shader_mod,
		entryPoint: "fragment_main",
		targets: [{ format }]
	},
	primitive: {
		topology: "triangle-strip"
	},
	layout: "auto"
});

const sampler = device.createSampler();

const uniform_buffer = device.createBuffer({
	size: 4 * (1 + 1 + 2),
	usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

/** @type {HTMLCanvasElement} */
const canv = document.getElementById("smooshed");

canv.style.width = W_LIM;

/** @type {RenderingContext} */
const ctxt = canv.getContext("webgpu");

ctxt.configure({ device, format });

/**
 *
 * @param {VideoFrame} frame
 */
async function smoosh(frame) {
	const uniform_vals = new Float32Array([
		(frame.codedHeight / frame.codedWidth), // Ratio
		H_FOV * Math.PI / 180, // HFoV
		canv.width, canv.height // Canvas width and height
	]);

	device.queue.writeBuffer(uniform_buffer, 0, uniform_vals);

	const texture = device.importExternalTexture({ source: frame });

	const bind_group = device.createBindGroup({
		layout: pipeline.getBindGroupLayout(0),
		entries: [
			{ binding: 0, resource: sampler },
			{ binding: 1, resource: { buffer: uniform_buffer } },
			{ binding: 2, resource: texture }
		]
	});

	const render_pass_desc = {
		colorAttachments: [
			{
				clearValue: { r: 0, g: 0.5, b: 1, a: 1 },
				loadOp: "clear",
				storeOp: "store",
				view: ctxt.getCurrentTexture().createView()
			}
		]
	};

	//---------
	// Drawing
	//---------
	const cmd_encoder = device.createCommandEncoder();
	const pass_enc = cmd_encoder.beginRenderPass(render_pass_desc);

	pass_enc.setPipeline(pipeline);
	pass_enc.setBindGroup(0, bind_group);

	pass_enc.draw(4);

	pass_enc.end();

	device.queue.submit([cmd_encoder.finish()]);
}

/**
 * Takes a file as a blob, reads it, and turns it into a data URL
 * @param {Blob} file
 * @returns {Promise<ArrayBuffer>}
 */
const file_to_url = (file) => new Promise((res, rej) => {
	let fr = new FileReader();

	fr.onload = function() { res(fr.result); }

	fr.readAsDataURL(file);
});

/**
 * Takes an image file as a blob and smooshes it and writes it to the main canvas
 * @param {Blob} file
 */
async function smoosh_img_file(file) {
	const bmp = await createImageBitmap(file);

	const frame = new VideoFrame(bmp, { timestamp: 0 });

	await smoosh(frame);

	frame.close();
	bmp.close();

	// Save image
	let link = document.createElement("a");
	link.href = canv.toDataURL();
	link.download = "image.png";
	link.click();
}

async function smoosh_vid_file(file) {
	const url = await file_to_url(file);
	const vid = document.createElement("video");

	vid.src = url;
	vid.mute = true;
	// vid.controls = true;
	vid.style.width = W_LIM;

	// document.body.appendChild(vid);

	const stream = canv.captureStream();
	const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
	const chunks = [];

	recorder.ondataavailable = function (evt) {
		chunks.push(URL.createObjectURL(evt.data));
	}

	recorder.onstop = function () {
		let link = document.createElement("a");
		link.href = chunks.join("");
		console.log(link.href);
		link.download = "video.webm";
		link.click();
	}

	vid.addEventListener("ended", function() {
		recorder.stop();
	});

	await vid.play();

	recorder.start();

	(function render() {
		const frame = new VideoFrame(vid);
		smoosh(frame);
		frame.close();
		vid.requestVideoFrameCallback(render);
	})();
}

document.getElementById("file_input").onchange = function() { check_file(this); }

function check_file(file_input_elem) {
	const filename = file_input_elem.value.trim().toLowerCase();
	const img_types = /\.(png|jpe?g|gif|bmp|webp)$/;
	const vid_types = /\.(mp4|webm|ogg)$/;

	if (img_types.test(filename)) {
		smoosh_img_file(file_input_elem.files[0]);
	} else if (vid_types.test(filename)) {
		smoosh_vid_file(file_input_elem.files[0]);
	}
}

document.onpaste = function(event) {
	event.preventDefault();
	let clipboard_data = (event.clipboardData || event.originalEvent.clipboardData);

	console.log(clipboard_data);

	if (clipboard_data.files[0] == undefined) return;

	document.getElementById("file_input").files = clipboard_data.files;
	check_file(document.getElementById("file_input"));
}

document.getElementById("fov_change").onclick = function(event) {
	H_FOV = prompt("Enter Horizontal FoV of the camera:");
}

document.getElementById("res_change").onclick = function(event) {
	const res = prompt("Enter Desired Resolution:");
	document.getElementById("smooshed").width = res;
	document.getElementById("smooshed").height = res;
}