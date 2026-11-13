import { useEffect, useRef, useState } from 'react'
import './hero-city.css'

const SOURCE = '/media/hero-city-source.jpg'
const CYCLE = 36

const vertexSource = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * .5 + .5;
  gl_Position = vec4(a_position, 0., 1.);
}`

const fragmentSource = `
precision highp float;
uniform sampler2D u_photo;
uniform vec2 u_resolution;
uniform float u_time;
varying vec2 v_uv;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x),
    mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y);
}
float cloud(vec2 p) {
  return noise(p) * .58 + noise(p * 2.03 + 7.1) * .28 + noise(p * 4.07 + 13.6) * .14;
}

// Read the untouched portrait source clockwise, with no generative changes to
// its buildings or skyline. The displayed panorama is 1920 by 864.
vec3 photograph(vec2 uv) {
  return texture2D(u_photo, vec2(1. - uv.y, uv.x)).rgb;
}
vec3 softPhoto(vec2 uv, float blur) {
  vec3 color = photograph(uv);
  if (blur < .02) return color;
  vec2 r = vec2(blur / 1920., blur / 864.);
  color *= .24;
  color += photograph(uv + vec2(r.x, 0.)) * .12;
  color += photograph(uv - vec2(r.x, 0.)) * .12;
  color += photograph(uv + vec2(0., r.y)) * .12;
  color += photograph(uv - vec2(0., r.y)) * .12;
  color += photograph(uv + r * .72) * .07;
  color += photograph(uv - r * .72) * .07;
  color += photograph(uv + vec2(r.x, -r.y) * .72) * .07;
  color += photograph(uv + vec2(-r.x, r.y) * .72) * .07;
  return color;
}

void main() {
  const float photoAspect = 1920. / 864.;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 cover = aspect < photoAspect ? vec2(aspect / photoAspect, 1.) : vec2(1., photoAspect / aspect);
  float phase = fract(u_time / 36.);
  float travelProgress = smoothstep(0., 1., phase);
  float dissolve = smoothstep(.875, 1., phase);
  float defocus = sin(dissolve * 3.14159265) * 12.;
  float zoom = 1.105 + sin(phase * 3.14159265) * .012;
  vec2 crop = cover / zoom;
  float travel = min(.055, (1. - crop.x) * .43);
  vec2 uv = (v_uv - .5) * crop + .5;
  vec2 next = (v_uv - .5) * (cover / 1.105) + .5;
  uv.x += mix(-travel, travel, travelProgress);
  next.x -= travel;

  // Only water and the upper sky move independently. The architecture stays
  // rigid, giving the photograph a quiet, filmed rather than rubbery feel.
  float water = 1. - smoothstep(.28, .39, uv.y);
  float sky = smoothstep(.59, .81, uv.y);
  vec2 ripple = vec2(
    sin(uv.y * 240. - u_time * 1.5) + sin(uv.x * 81. + uv.y * 110. + u_time * .65),
    sin(uv.x * 118. + uv.y * 92. - u_time * .8)
  ) * vec2(.00065, .00024) * water;
  float vapor = cloud(vec2(uv.x * 5.5 - u_time * .009, uv.y * 7.));
  vec2 drift = vec2((vapor - .5) * .003, sin(u_time * .13 + uv.x * 7.) * .0008) * sky;
  vec3 color = softPhoto(uv + ripple + drift, defocus);
  if (dissolve > .001) color = mix(color, softPhoto(next + ripple + drift, defocus), dissolve);

  float mist = smoothstep(.43, .75, vapor) * sky;
  color = mix(color, vec3(.30, .405, .51), mist * .105);
  float waterLight = sin(uv.y * 420. - u_time * 1.3 + uv.x * 17.) * .004 * water;
  color += vec3(.7, .85, 1.) * waterLight;
  gl_FragColor = vec4(color, 1.);
}`

function makeShader(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

export default function HeroCity() {
  const rootRef = useRef(null)
  const canvasRef = useRef(null)
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(preference.matches)
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    root.dataset.active = 'false'
    root.dataset.ready = 'false'
    root.dataset.sceneTime = '0'
    root.dataset.renderer = reduced ? 'still' : 'loading'
    if (!canvas || reduced) return

    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' })
    if (!gl) { root.dataset.renderer = 'fallback'; return }
    let program, vertex, fragment, buffer, texture
    let frame = 0
    let elapsed = 0
    let previous = 0
    let lastPaint = 0
    let visible = false
    let loaded = false
    let alive = true
    let lost = false

    try {
      vertex = makeShader(gl, gl.VERTEX_SHADER, vertexSource)
      fragment = makeShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
      program = gl.createProgram()
      gl.attachShader(program, vertex)
      gl.attachShader(program, fragment)
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program))
    } catch {
      if (program) gl.deleteProgram(program)
      if (vertex) gl.deleteShader(vertex)
      if (fragment) gl.deleteShader(fragment)
      root.dataset.renderer = 'fallback'
      return
    }

    gl.useProgram(program)
    buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    const resolution = gl.getUniformLocation(program, 'u_resolution')
    const time = gl.getUniformLocation(program, 'u_time')
    texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.uniform1i(gl.getUniformLocation(program, 'u_photo'), 0)

    const paint = () => {
      if (!loaded || lost || !alive) return
      gl.uniform2f(resolution, canvas.width, canvas.height)
      gl.uniform1f(time, elapsed)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      root.dataset.ready = 'true'
      root.dataset.renderer = 'webgl'
      root.dataset.sceneTime = elapsed.toFixed(3)
      root.dataset.scenePhase = ((elapsed % CYCLE) / CYCLE).toFixed(4)
    }
    const tick = now => {
      frame = 0
      if (!alive || !loaded || !visible || document.hidden || lost) return
      if (!previous) previous = now
      elapsed += Math.min((now - previous) / 1000, .12)
      previous = now
      if (now - lastPaint >= 1000 / 24) {
        lastPaint = now - (now - lastPaint) % (1000 / 24)
        paint()
      }
      frame = requestAnimationFrame(tick)
    }
    const updatePlayback = () => {
      const active = loaded && visible && !document.hidden && !lost
      root.dataset.active = String(active)
      if (active && !frame) { previous = 0; lastPaint = 0; frame = requestAnimationFrame(tick) }
      if (!active) { cancelAnimationFrame(frame); frame = 0; previous = 0 }
    }
    const resize = () => {
      const { width, height } = root.getBoundingClientRect()
      const scale = Math.min(window.devicePixelRatio || 1, 1.25, Math.sqrt(1200000 / Math.max(1, width * height)))
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))
      gl.viewport(0, 0, canvas.width, canvas.height)
      paint()
    }
    const image = new Image()
    image.onload = () => {
      if (!alive || lost) return
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image)
      loaded = true
      resize()
      updatePlayback()
    }
    image.onerror = () => { root.dataset.renderer = 'fallback' }
    image.src = SOURCE
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(root)
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      updatePlayback()
    }, { threshold: .01 })
    intersectionObserver.observe(root)
    const contextLost = event => {
      event.preventDefault()
      lost = true
      root.dataset.ready = 'false'
      root.dataset.renderer = 'fallback'
      updatePlayback()
    }
    canvas.addEventListener('webglcontextlost', contextLost)
    document.addEventListener('visibilitychange', updatePlayback)

    return () => {
      alive = false
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      image.onload = image.onerror = null
      document.removeEventListener('visibilitychange', updatePlayback)
      canvas.removeEventListener('webglcontextlost', contextLost)
      gl.deleteTexture(texture)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vertex)
      gl.deleteShader(fragment)
    }
  }, [reduced])

  return <div ref={rootRef} className="hero-media hero-city" aria-hidden="true" data-active="false">
    <img className="hero-poster" src={SOURCE} alt="" width="864" height="1920" fetchPriority="high" />
    {!reduced && <canvas ref={canvasRef} className="hero-city-canvas" />}
  </div>
}
