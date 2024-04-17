// TODO:
// Allow user to change the fov
// Allow user to change canvas resolution
// Don't accumulate canvas objects
// Figure out a better way to save the canvas
// Mute and hide video controls
// Add manual progress bar to show video progress
// Try to make the video processing happen faster than 1x?
// X Figure out a way to save an entire video

const W_LIM = 500;
const H_FOV = 81;

// Testing for and setting up WebGPU
if (!navigator.gpu) throw Error("WebGPU not supported");
const adapter = await navigator.gpu.requestAdapter();
if (!adapter) throw Error("Couldn't request WebGPU Adapter");
const device = await adapter.requestDevice();
if (!device) throw Error("Couldn't request WebGPU Device");

const format = navigator.gpu.getPreferredCanvasFormat();

const shader_mod = device.createShaderModule({ code: shaders });

const pipeline_desc = {
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
};

const render_pipeline = device.createRenderPipeline(pipeline_desc);

const sampler = device.createSampler();

const uniform_buffer = device.createBuffer({
	size: 4 * (1 + 1 + 2),
	usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const bind_group = device.createBindGroup({
	layout: render_pipeline.getBindGroupLayout(0),
	entries: [
		{ binding: 0, resource: sampler },
		{ binding: 1, resource: { buffer: uniform_buffer } }
	]
});

/** @type {HTMLCanvasElement} */
const canv = document.getElementById("smooshed");

canv.style.width = W_LIM;

/** @type {RenderingContext} */
const ctxt = canv.getContext("webgpu");

ctxt.configure({ device, format });

async function smoosh(frame) {
	const uniform_vals = new Float32Array([
		(frame.codedHeight / frame.codedWidth), // Ratio
		H_FOV * Math.PI / 180, // HFoV
		canv.width, canv.height // Canvas width and height
	]);

	device.queue.writeBuffer(uniform_buffer, 0, uniform_vals);

	const texture = device.importExternalTexture({
		source: frame
	});

	const bind_group2 = device.createBindGroup({
		layout: render_pipeline.getBindGroupLayout(1),
		entries: [
			{ binding: 0, resource: texture },
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

	pass_enc.setPipeline(render_pipeline);
	pass_enc.setBindGroup(0, bind_group);
	pass_enc.setBindGroup(1, bind_group2);

	pass_enc.draw(4);

	pass_enc.end();

	device.queue.submit([cmd_encoder.finish()]);
}

/**
 * Takes an image as a data URL and converts it into image data
 * @param {string} url
 * @returns {Promise<ImageData>}
 */
const url_to_data = (url) => new Promise((res, rej) => {
	const img = document.createElement("img");

	img.onload = function () {
		console.log(this.width, this.height);
		const local_canv = document.createElement("canvas");
		local_canv.width = this.width;
		local_canv.height = this.height;
		local_canv.style.width = W_LIM;
		const local_ctxt = local_canv.getContext("2d");
		local_ctxt.drawImage(img, 0, 0);
		document.body.appendChild(local_canv);

		res(local_ctxt.getImageData(0, 0, this.width, this.height));
	}

	img.src = url;
});

const quick_check_url = str => (/^((http|https|data):)/).test(str);

const file_to_url = (file) => new Promise((res, rej) => {
	let fr = new FileReader();

	fr.onload = function() { res(fr.result); }

	fr.readAsDataURL(file);
});

async function smoosh_img_file(file) {
	const url = await file_to_url(file);
	if (!quick_check_url(url)) throw Error("Invalid Image");

	const img_dat = await url_to_data(url);
	console.log(img_dat);

	const frame = new VideoFrame(await createImageBitmap(img_dat), {
		timestamp: 0,
		visibleRect: {
			width: img_dat.width,
			height: img_dat.height
		}
	});

	await smoosh(frame);

	frame.close();

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
	vid.controls = true;
	vid.style.width = W_LIM;

	document.body.appendChild(vid);

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

file_input.onchange = function() { check_file(this); }

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
	if (clipboard_data.files[0] == undefined) return;

	file_input.files = clipboard_data.files;
	check_file(file_input);
}