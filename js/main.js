'use-strict'

const VERTEX_SHADER = `
    precision mediump float;

    attribute vec3 position;
    attribute vec2 textCoord;
    attribute vec3 normal;
    
    varying vec2 fragTextCoord;
    varying vec3 fragNormal;

    uniform mat4 worldMatrix;
    uniform mat4 viewMatrix;
    uniform mat4 projectionMatrix;

    void main() {
        fragTextCoord = textCoord;
        fragNormal = (worldMatrix * vec4(normal, 0.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * worldMatrix * vec4(position, 1.0);
    }
`;

const FRAGMENT_SHADER  = `
    precision mediump float;

    varying vec2 fragTextCoord;
    varying vec3 fragNormal;

    uniform sampler2D sampler;

    void main() {
        vec3 ambientLightIntensity = vec3(0.3, 0.3, 0.3);
        vec3 sunLightIntensity = vec3(0.2, 0.2, 0.2);
        vec3 sunDirection = normalize(vec3(1, 5.0, 2));

        vec4 texel = texture2D(sampler, fragTextCoord);

        vec3 lightIntensity = ambientLightIntensity + sunLightIntensity + max(dot(fragNormal, sunDirection), 0.0);

        gl_FragColor = vec4(texel.rgb * lightIntensity, texel.a);
    }
`;

const canvas = document.querySelector('#gl-canvas');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const midX = canvas.width / 2;
const midY = canvas.height / 2;

let mouseX = midX;
let mouseY = midY;

/** @type {WebGLRenderingContext} */
let gl = canvas.getContext('webgl');

if (!gl) {
    alert('Sorry, your browser or machine does not support WebGL to run this game.');
}

let monkeyModel;
let monkeyTexture;
let projectTexture;
let enemyTexture;
let enemyModel;

async function loadAssets() {
    monkeyModel = await fetch('../models/monkey.json').then(res => res.json());
    monkeyTexture = await createImageBitmap(await fetch('../images/rectangletexture.png').then(res => res.blob()));
    projectTexture = await createImageBitmap(await fetch('../images/rectangletexture2.png').then(res => res.blob()));
    enemyModel = await fetch('../models/box.json').then(res => res.json());
    enemyTexture = new Image();
    enemyTexture.src = '../images/BoxTexture.png';
}

class WebGLObject {

    //Buffers
    verticeBuffer;
    indiceBuffer;
    texCoorBuffer;
    normalBuffer;

    //Shaders
    vertexShader;
    fragmentShader;

    //Attributes
    vertexRef;
    texCoordRef;
    normalRef

    //Model Data
    vertexData
    indiceData
    texCoords
    normals

    program;

    texture;

    constructor(mesh, texture) {
        this.loadMesh(mesh);
        this.initBuffers(mesh);
        this.initShaders();
        this.loadTexture(texture);
    }

    loadMesh(modelData) {
        this.vertexData = modelData.meshes[0].vertices;
        this.indiceData = [].concat.apply([], modelData.meshes[0].faces);
        this.texCoords = modelData.meshes[0].texturecoords[0];
        this.normals = modelData.meshes[0].normals;
    }

    initBuffers() {
        this.verticeBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.verticeBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertexData), gl.STATIC_DRAW);

        this.indiceBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indiceBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.indiceData), gl.STATIC_DRAW);

        this.texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.texCoords), gl.STATIC_DRAW);

        this.normalBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.normals), gl.STATIC_DRAW);
    }

    initShaders() {
        this.vertexShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(this.vertexShader, VERTEX_SHADER);
        gl.compileShader(this.vertexShader);

        this.fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(this.fragmentShader, FRAGMENT_SHADER);
        gl.compileShader(this.fragmentShader);

        this.program = gl.createProgram();
        gl.attachShader(this.program, this.vertexShader);
        gl.attachShader(this.program, this.fragmentShader);
        gl.linkProgram(this.program);
    }

    initAttributes() {
        this.vertexRef = gl.getAttribLocation(this.program, 'position');
        gl.enableVertexAttribArray(this.vertexRef);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.verticeBuffer);
        gl.vertexAttribPointer(this.vertexRef, 3, gl.FLOAT, false, 3 * Float32Array.BYTES_PER_ELEMENT, 0);

        this.texCoordRef = gl.getAttribLocation(this.program, 'textCoord');
        gl.enableVertexAttribArray(this.texCoordRef);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
        gl.vertexAttribPointer(this.texCoordRef, 2, gl.FLOAT, false, 2 * Float32Array.BYTES_PER_ELEMENT, 0);

        this.normalRef = gl.getAttribLocation(this.program, 'normal');
        gl.enableVertexAttribArray(this.normalRef);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
        gl.vertexAttribPointer(this.normalRef, 3, gl.FLOAT, true, 3 * Float32Array.BYTES_PER_ELEMENT, 0);
    }

    loadTexture(image) {
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    }
}

class Entity extends WebGLObject {

    model;
    scale;
    x;
    y;
    speed;
    angle = 0;

    constructor(model, texture, scale, x, y, speed) {
        super(model, texture);

        this.model = model;
        this.scale = scale;
        this.x = x;
        this.y = y;
        this.speed = speed;
    }

    updatePosition() {
        this.x += this.speed * Math.cos(this.angle - 1.5708);
        this.y += this.speed * Math.sin(this.angle - 1.5708);
    }

    setAngle(angle) {
        this.angle = angle;
    }

    draw() {
        gl.useProgram(this.program);
        gl.enable(gl.DEPTH_TEST);
        
        this.initAttributes();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.activeTexture(gl.TEXTURE0);

        let uniformLocations = {
            worldMatrix: gl.getUniformLocation(this.program, 'worldMatrix'),
            projectionMatrix: gl.getUniformLocation(this.program, 'projectionMatrix'),
            viewMatrix: gl.getUniformLocation(this.program, 'viewMatrix')
        };

        let worldMatrix = glMatrix.mat4.create();
        glMatrix.mat4.translate(worldMatrix, worldMatrix, [this.x, this.y, 0]);
        glMatrix.mat4.rotate(worldMatrix, worldMatrix, this.angle, [0, 0, 1]);
        glMatrix.mat4.scale(worldMatrix, worldMatrix, [this.scale, this.scale, this.scale]);

        let projectionMatrix = glMatrix.mat4.create();
        glMatrix.mat4.perspective(projectionMatrix,
            90 * Math.PI / 180,
            gl.canvas.width / gl.canvas.height,
            0.1,
            1000);
        
        let viewMatrix = glMatrix.mat4.create();
        glMatrix.mat4.lookAt(viewMatrix,  [0, 0, 5], [0, 0, 0], [0, 1, 0]);

        gl.uniformMatrix4fv(uniformLocations.worldMatrix, false, worldMatrix);
        gl.uniformMatrix4fv(uniformLocations.viewMatrix, false, viewMatrix);
        gl.uniformMatrix4fv(uniformLocations.projectionMatrix, false, projectionMatrix);
        
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indiceBuffer);
        gl.drawElements(gl.TRIANGLES, this.indiceData.length, gl.UNSIGNED_SHORT, 0);
    }
}

class Player extends Entity {

    activeProjectiles = [];

    constructor(model, texture) {
        super(model, texture, 0.5, 0, 0, 0);
    }

    fire(angle) {
        this.activeProjectiles.push(new Projectile(angle));
    }
}

class Projectile extends Entity {

    constructor(angle) {
        super(monkeyModel, projectTexture, 0.2, 0, 0, 0.075);

        this.angle = angle;
    }
}

class Enemy extends Entity {

    constructor() {

        const minPoint = -6;
        const maxPoint = 6;

        let x = maxPoint;
        let y = maxPoint;

        if (Math.random() < 0.5) {
            x = Math.floor(Math.random() * ((maxPoint - minPoint) + 1) + minPoint);
            if (x > minPoint || x < maxPoint) y = Math.random() < 0.5 ? maxPoint : minPoint;
            else y = Math.floor(Math.random() * ((maxPoint - minPoint) + 1) + minPoint);
        } else {
            y = Math.floor(Math.random() * ((maxPoint - minPoint) + 1) + minPoint);
            if (y > minPoint || y < maxPoint) x = Math.random() < 0.5 ? maxPoint : minPoint;
            else x = Math.floor(Math.random() * ((maxPoint - minPoint) + 1) + minPoint);
        }

        super(enemyModel, enemyTexture, 0.75, x, y, 0.075);
        this.setAngle();
    }

    setAngle() {
        this.angle = Math.atan2(this.y, this.x) - 1.5708;
    }

    updatePosition() {
        this.x += this.speed * Math.cos(this.angle - 1.5708);
        this.y += this.speed * Math.sin(this.angle - 1.5708);
    }
}

main();

let gameOver = false;
let player;
let enemies = [];

canvas.addEventListener('mousemove', (/** @type {MouseEvent} */e) => {
    mouseX = e.offsetX - midX;
    mouseY = midY - e.offsetY;
});

canvas.addEventListener('click', () => {
    let angle = Math.atan2(mouseY, mouseX) + 1.5708;
    player.fire(angle);
});

async function main() {
    await this.loadAssets();
    player = new Player(monkeyModel, monkeyTexture);
    animate();

    let spawnEnemies = setInterval(() => {
        if (!gameOver) enemies.push(new Enemy());
        else window.clearInterval(spawnEnemies);
    }, 450);
}

function animate() {
    let angle = Math.atan2(mouseY, mouseX) + 1.5708;

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
    player.setAngle(angle);
    player.draw();

    player.activeProjectiles.forEach((proj, projIndex) => {
        proj.updatePosition();
        proj.draw();
        if (entityIsOffscreen(proj)) player.activeProjectiles.splice(projIndex, 1);

        enemies.forEach((enemy, enemyIndex) => {
            if (detectCollision(enemy, proj)) {
                enemies.splice(enemyIndex, 1);
                player.activeProjectiles.splice(projIndex, 1);
            }
        })
    });

    enemies.forEach(enemy => {
        enemy.updatePosition();
        enemy.draw();
        if (detectCollision(enemy, player)) gameOver = true;
    });

    if (!gameOver) {
        requestAnimationFrame(animate);
    }
}

function detectCollision(/** @type {Entity} */entityOne, /** @type {Entity} */entityTwo) {
    let entityOneBox = calculateBoundingBox(entityOne);
    let entityTwoBox = calculateBoundingBox(entityTwo);

    return (entityOne.x + entityOneBox.minX * entityOne.scale <= entityTwo.x + entityTwoBox.maxX * entityTwo.scale 
            && entityOne.x + entityOneBox.maxX * entityOne.scale >= entityTwo.x + entityTwoBox.minX * entityTwo.scale) 
        && (entityOne.y + entityOneBox.minY * entityOne.scale <= entityTwo.y + entityTwoBox.maxY * entityTwo.scale 
            && entityOne.y + entityOneBox.maxY * entityOne.scale >= entityTwo.y + entityTwoBox.minY * entityTwo.scale);
}

function calculateBoundingBox(/** @type {Entity} */ entity) {
    let vertices = entity.model.meshes[0].vertices;

    let minX = maxX = vertices[0];
    let minY = maxY = vertices[1];
    let minZ = maxZ = vertices[2];

    for (let i = 3; i < vertices.length; i += 3) {
        if (minX > vertices[i]) minX = vertices[i];
        if (maxX < vertices[i]) maxX = vertices[i];
        
        if (minY > vertices[i + 1]) minY = vertices[i];
        if (maxY < vertices[i + 1]) maxY = vertices[i];

        if (minZ > vertices[i + 2]) minZ = vertices[i];
        if (maxZ < vertices[i + 2]) maxZ = vertices[i];
    }

    return {minX: minX, maxX: maxX, minY: minY, maxY: maxY, minZ: minZ, maxZ: maxZ};
}

function entityIsOffscreen(/** @type {Entity} */ entity) {
    if (entity.x > 6 || entity.x < -6) return true;
    if (entity.y > 6 || entity.y < - 6) return true;

    return false;
}