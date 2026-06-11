"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, CheckCircle, Clock, Loader2, LogIn, LogOut, MapPin, QrCode, Scan, Wifi, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type jsQRType from "jsqr";

interface TodayStatus {
  date: string;
  employee_profile: {
    id: string | null;
    employee_id: string | null;
    full_name: string | null;
    status: string | null;
    attendance_enabled: boolean;
    message: string | null;
  };
  checked_in: boolean;
  checked_out: boolean;
  attendance_type: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  hours_worked: number | null;
  method: string | null;
  site_id: string | null;
  attendance_site: {
    site_id: string;
    required: boolean;
    name: string | null;
  } | null;
  shift: {
    name: string;
    shift_type: string;
    start_time: string | null;
    end_time: string | null;
    grace_minutes: number;
  } | null;
}

function formatTime(t: string | null) {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export default function CheckInPage() {
  const router = useRouter();
  const [status, setStatus] = useState<TodayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // GPS + Selfie state
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // QR scanner state
  const qrVideoRef = useRef<HTMLVideoElement>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const qrScanFrameRef = useRef<number | null>(null);
  const jsQRRef = useRef<typeof jsQRType | null>(null);
  const [qrScannerActive, setQrScannerActive] = useState(false);
  const [qrScannerReady, setQrScannerReady] = useState(false);
  const [qrScannerError, setQrScannerError] = useState<string | null>(null);

  // QR token + location state
  const [qrInput, setQrInput] = useState("");
  const [qrTokenConfirmed, setQrTokenConfirmed] = useState(false);
  const [qrGpsCoords, setQrGpsCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [qrGpsLoading, setQrGpsLoading] = useState(false);
  const [qrGpsError, setQrGpsError] = useState<string | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);

  useEffect(() => {
    fetchStatus();
    return () => { stopQrScanner(); };
  }, []);

  async function fetchStatus() {
    setLoading(true);
    const res = await fetch("/api/hr/attendance/today");
    const data = await res.json().catch(() => null);
    if (res.ok && data) {
      setStatus(data);
    } else {
      toast.error(data?.error ?? "Failed to load attendance status");
    }
    setLoading(false);
  }

  async function handleCheckOut(payload?: Record<string, unknown>) {
    setSubmitting(true);
    const res = await fetch("/api/hr/attendance/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload ?? { method: "web" }),
    });
    const data = await res.json();
    if (res.ok) {
      toast.success(`Checked out at ${formatTime(data.check_out_time)}${data.hours_worked ? ` · ${data.hours_worked}h worked` : ""}`);
      fetchStatus();
    } else {
      toast.error(data.error ?? "Check-out failed");
    }
    setSubmitting(false);
  }

  async function submitCheckIn(payload: Record<string, unknown>) {
    setSubmitting(true);
    const res = await fetch("/api/hr/attendance/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok) {
      const label = data.attendance_type === "LATE" ? "Late arrival recorded" : "Checked in successfully";
      toast.success(label);
      fetchStatus();
      stopCamera();
    } else {
      toast.error(data.error ?? "Check-in failed");
    }
    setSubmitting(false);
  }

  // ── Web method ────────────────────────────────────────────────────────────
  function handleWebCheckIn() {
    submitCheckIn({ method: "web" });
  }

  // ── GPS + Selfie ───────────────────────────────────────────────────────────
  async function startCamera() {
    try {
      setVideoReady(false);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadeddata = () => setVideoReady(true);
        videoRef.current.play();
      }
      setCameraActive(true);
      setCapturedPhoto(null);
    } catch {
      toast.error("Camera access denied");
    }
  }

  function stopCamera() {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setVideoReady(false);
  }

  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    try {
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context unavailable");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
      setCapturedPhoto(dataUrl);
      stopCamera();
      toast.success("Selfie captured — getting your location…");
      fetchGPS();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Capture failed");
    }
  }

  function fetchGPS() {
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGpsLoading(false);
      },
      (err) => {
        setGpsError(err.message);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function handleGpsCheckIn() {
    if (!capturedPhoto) return toast.error("Please capture your selfie first");
    if (!gpsCoords) return toast.error("Please allow location access first");
    submitCheckIn({
      method: "gps",
      lat: gpsCoords.lat,
      lng: gpsCoords.lng,
      gps_accuracy: gpsCoords.accuracy,
      selfie_base64: capturedPhoto,
    });
  }

  // ── QR scanner ────────────────────────────────────────────────────────────
  function scanQrFrame() {
    const video = qrVideoRef.current;
    const canvas = qrCanvasRef.current;
    const jsQR = jsQRRef.current;
    if (!video || !canvas || !jsQR || video.readyState < 2 || video.videoWidth === 0) {
      qrScanFrameRef.current = requestAnimationFrame(scanQrFrame);
      return;
    }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
    if (code?.data) {
      stopQrScanner();
      confirmQrToken(code.data);
    } else {
      qrScanFrameRef.current = requestAnimationFrame(scanQrFrame);
    }
  }

  async function startQrScanner() {
    setQrScannerError(null);
    try {
      if (!jsQRRef.current) {
        const mod = await import("jsqr");
        jsQRRef.current = mod.default;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (qrVideoRef.current) {
        qrVideoRef.current.srcObject = stream;
        qrVideoRef.current.onloadeddata = () => {
          setQrScannerReady(true);
          scanQrFrame();
        };
        qrVideoRef.current.play();
      }
      setQrScannerActive(true);
    } catch {
      setQrScannerError("Camera access denied — enter the token manually below");
      setShowManualInput(true);
    }
  }

  function stopQrScanner() {
    if (qrScanFrameRef.current) {
      cancelAnimationFrame(qrScanFrameRef.current);
      qrScanFrameRef.current = null;
    }
    if (qrVideoRef.current?.srcObject) {
      (qrVideoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      qrVideoRef.current.srcObject = null;
    }
    setQrScannerActive(false);
    setQrScannerReady(false);
  }

  function resetQrToken() {
    setQrInput("");
    setQrTokenConfirmed(false);
    setQrGpsCoords(null);
    setQrGpsError(null);
    setQrGpsLoading(false);
  }

  function confirmQrToken(token?: string) {
    const t = (token ?? qrInput).trim();
    if (!t) return toast.error("Enter the QR token");
    if (token) setQrInput(token);
    setQrTokenConfirmed(true);
    setQrGpsCoords(null);
    setQrGpsError(null);
    setQrGpsLoading(true);
    if (token) toast.success("QR code scanned — verifying location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setQrGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setQrGpsLoading(false);
      },
      (err) => {
        setQrGpsError(err.message);
        setQrGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function handleQrAttendance() {
    if (!qrInput.trim() || !qrGpsCoords) return;
    const payload = { method: "qr", qr_token: qrInput.trim(), lat: qrGpsCoords.lat, lng: qrGpsCoords.lng, gps_accuracy: qrGpsCoords.accuracy };
    if (status?.checked_in && !status.checked_out) handleCheckOut(payload);
    else submitCheckIn(payload);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const siteRequired = !!status?.attendance_site?.required;
  const siteRequiredCheckout = !!status?.checked_in && !status.checked_out && siteRequired;
  const employeeProfile = status?.employee_profile;
  const attendanceEnabled = !!employeeProfile?.attendance_enabled;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Attendance Check-in</h1>
        <p className="text-sm text-muted-foreground mt-1">{today}</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Employee</p>
              <p className="font-medium truncate">{employeeProfile?.full_name ?? "Unknown employee"}</p>
            </div>
            <Badge variant={attendanceEnabled ? "default" : "secondary"}>
              {attendanceEnabled ? "Mobile ready" : "Setup required"}
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Employee ID</span>
            <span className="text-sm font-medium">{employeeProfile?.employee_id ?? "Not assigned"}</span>
          </div>
          {status?.attendance_site?.name && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Assigned site</span>
              <span className="text-sm font-medium text-right">{status.attendance_site.name}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Today's status card */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            {status?.checked_in ? (
              <Badge variant={status.attendance_type === "LATE" ? "destructive" : "default"}>
                {status.attendance_type === "LATE" ? "Late" : status.attendance_type ?? "Present"}
              </Badge>
            ) : (
              <Badge variant="outline">Not checked in</Badge>
            )}
          </div>
          {status?.shift && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Shift</span>
              <span className="text-sm font-medium">
                {status.shift.name}
                {status.shift.start_time && ` · ${formatTime(status.shift.start_time)} – ${formatTime(status.shift.end_time)}`}
              </span>
            </div>
          )}
          {status?.check_in_time && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Check-in</span>
              <span className="text-sm font-medium">{formatTime(status.check_in_time)}</span>
            </div>
          )}
          {status?.check_out_time && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Check-out</span>
              <span className="text-sm font-medium">{formatTime(status.check_out_time)}</span>
            </div>
          )}
          {status?.hours_worked && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Hours worked</span>
              <span className="text-sm font-medium">{status.hours_worked}h</span>
            </div>
          )}
        </CardContent>
      </Card>

      {!attendanceEnabled && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base">Attendance setup required</CardTitle>
            <CardDescription>
              Sign in on your phone with an account linked to an active employee profile before checking in or out.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {employeeProfile?.message ?? "Your account is not ready for attendance."}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Check-out button */}
      {attendanceEnabled && status?.checked_in && !status.checked_out && !siteRequiredCheckout && (
        <Button variant="destructive" className="w-full h-14 text-base" onClick={() => handleCheckOut()} disabled={submitting}>
          {submitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <LogOut className="mr-2 h-5 w-5" />}
          Check Out
        </Button>
      )}

      {status?.checked_in && status.checked_out && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <span className="text-sm text-muted-foreground">Attendance complete for today</span>
        </div>
      )}

      {/* Check-in methods */}
      {attendanceEnabled && (!status?.checked_in || siteRequiredCheckout) && (
        <Tabs defaultValue={siteRequired || siteRequiredCheckout ? "qr" : "web"} onValueChange={() => stopQrScanner()}>
          {!siteRequiredCheckout && (
            <TabsList className="w-full">
              {!siteRequired && (
                <>
                  <TabsTrigger value="web" className="flex-1">
                    <Wifi className="mr-1.5 h-4 w-4" />Web
                  </TabsTrigger>
                  <TabsTrigger value="gps" className="flex-1">
                    <MapPin className="mr-1.5 h-4 w-4" />GPS + Selfie
                  </TabsTrigger>
                </>
              )}
              <TabsTrigger value="qr" className="flex-1">
                <QrCode className="mr-1.5 h-4 w-4" />QR Code
              </TabsTrigger>
            </TabsList>
          )}

          {/* Web tab */}
          {!siteRequired && (
          <TabsContent value="web">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Web Check-in</CardTitle>
                <CardDescription>For office and remote staff. One-click attendance.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full h-14 text-base" onClick={handleWebCheckIn} disabled={submitting}>
                  {submitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <LogIn className="mr-2 h-5 w-5" />}
                  Check In Now
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
          )}

          {/* GPS + Selfie tab */}
          {!siteRequired && (
          <TabsContent value="gps">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">GPS + Selfie Check-in</CardTitle>
                <CardDescription>For site/field workers. Validates your location and identity.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Step 1 — Capture selfie</p>
                  {capturedPhoto ? (
                    <div className="relative">
                      <img src={capturedPhoto} alt="Selfie preview" className="w-full rounded-lg max-h-48 object-cover" />
                      <Button variant="outline" size="sm" className="mt-2 w-full" onClick={startCamera}>
                        <Camera className="mr-2 h-4 w-4" />Retake
                      </Button>
                    </div>
                  ) : cameraActive ? (
                    <div className="space-y-2">
                      <video ref={videoRef} className="w-full rounded-lg max-h-48 object-cover bg-black" autoPlay playsInline muted />
                      <canvas ref={canvasRef} className="hidden" />
                      <div className="flex gap-2">
                        <Button className="flex-1" onClick={capturePhoto} disabled={!videoReady}>
                          {videoReady ? <Camera className="mr-2 h-4 w-4" /> : <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          {videoReady ? "Capture" : "Loading…"}
                        </Button>
                        <Button variant="outline" onClick={stopCamera}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="outline" className="w-full" onClick={startCamera}>
                      <Camera className="mr-2 h-4 w-4" />Open Camera
                    </Button>
                  )}
                </div>

                <div className={`space-y-2 transition-opacity ${capturedPhoto ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
                  <p className="text-sm font-medium">Step 2 — Confirm location</p>
                  {gpsCoords ? (
                    <div className="flex items-center gap-2 rounded-md border bg-green-50 dark:bg-green-950/20 px-3 py-2 text-sm text-green-700 dark:text-green-400">
                      <MapPin className="h-4 w-4 shrink-0" />
                      Location captured · ±{Math.round(gpsCoords.accuracy)}m accuracy
                    </div>
                  ) : gpsLoading ? (
                    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                      Getting your location…
                    </div>
                  ) : gpsError ? (
                    <div className="space-y-2">
                      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{gpsError}</div>
                      <Button variant="outline" size="sm" className="w-full" onClick={fetchGPS}>
                        <MapPin className="mr-2 h-3.5 w-3.5" />Retry Location
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                      Waiting for selfie…
                    </div>
                  )}
                </div>

                <Button className="w-full h-12 text-base" onClick={handleGpsCheckIn} disabled={submitting || !capturedPhoto || !gpsCoords}>
                  {submitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <LogIn className="mr-2 h-5 w-5" />}
                  Submit Check-in
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
          )}

          {/* QR tab */}
          <TabsContent value="qr">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Site QR {siteRequiredCheckout ? "Check-out" : "Check-in"}</CardTitle>
                <CardDescription>
                  Scan the fixed QR code posted at your site. Location is verified automatically.
                  {status?.attendance_site?.name ? ` Assigned site: ${status.attendance_site.name}.` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* Step 1 — Scan or enter token */}
                <div className="space-y-3">
                  <p className="text-sm font-medium">Step 1 — Scan site QR code</p>

                  {qrTokenConfirmed ? (
                    /* Token confirmed — show green pill + change button */
                    <div className="flex items-center justify-between rounded-md border bg-green-50 dark:bg-green-950/20 px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <QrCode className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                        <span className="text-sm text-green-700 dark:text-green-400 font-mono truncate">
                          {qrInput.length > 20 ? `${qrInput.slice(0, 8)}…${qrInput.slice(-8)}` : qrInput}
                        </span>
                      </div>
                      <button
                        className="text-xs text-muted-foreground underline ml-3 shrink-0"
                        onClick={() => { resetQrToken(); setShowManualInput(false); }}
                      >
                        Change
                      </button>
                    </div>
                  ) : qrScannerActive ? (
                    /* Camera scanner active */
                    <div className="space-y-2">
                      <div className="relative rounded-lg overflow-hidden bg-black aspect-square max-h-72 w-full">
                        <video
                          ref={qrVideoRef}
                          className="w-full h-full object-cover"
                          autoPlay
                          playsInline
                          muted
                        />
                        <canvas ref={qrCanvasRef} className="hidden" />
                        {/* Viewfinder overlay */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <div className="relative w-52 h-52">
                            {/* Corner marks */}
                            <span className="absolute top-0 left-0 w-7 h-7 border-t-[3px] border-l-[3px] border-white rounded-tl-sm" />
                            <span className="absolute top-0 right-0 w-7 h-7 border-t-[3px] border-r-[3px] border-white rounded-tr-sm" />
                            <span className="absolute bottom-0 left-0 w-7 h-7 border-b-[3px] border-l-[3px] border-white rounded-bl-sm" />
                            <span className="absolute bottom-0 right-0 w-7 h-7 border-b-[3px] border-r-[3px] border-white rounded-br-sm" />
                            {/* Scanning indicator */}
                            {qrScannerReady && (
                              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-green-400/80 animate-pulse" />
                            )}
                          </div>
                          <p className="mt-3 text-xs text-white/80">
                            {qrScannerReady ? "Align the posted site QR within the frame" : "Starting camera…"}
                          </p>
                        </div>
                      </div>
                      <Button variant="outline" className="w-full" onClick={stopQrScanner}>
                        <X className="mr-2 h-4 w-4" />Cancel Scan
                      </Button>
                    </div>
                  ) : (
                    /* Initial state — scan button + optional manual input */
                    <div className="space-y-3">
                      {qrScannerError && (
                        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                          {qrScannerError}
                        </div>
                      )}
                      <Button className="w-full h-12" onClick={startQrScanner}>
                        <Scan className="mr-2 h-5 w-5" />Scan Site QR
                      </Button>
                      <button
                        className="w-full text-xs text-muted-foreground underline text-center"
                        onClick={() => setShowManualInput(v => !v)}
                      >
                        {showManualInput ? "Hide manual entry" : "Enter QR token manually instead"}
                      </button>
                      {showManualInput && (
                        <div className="flex gap-2">
                          <input
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            placeholder="Paste fixed site QR token…"
                            value={qrInput}
                            onChange={(e) => { setQrInput(e.target.value); }}
                            onKeyDown={(e) => e.key === "Enter" && confirmQrToken()}
                          />
                          <Button onClick={() => confirmQrToken()} disabled={!qrInput.trim()}>
                            Confirm
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />Use the fixed QR posted for your assigned site
                  </p>
                </div>

                {/* Step 2 — Location */}
                <div className={`space-y-2 transition-opacity ${qrTokenConfirmed ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
                  <p className="text-sm font-medium">Step 2 — Confirm location</p>
                  {qrGpsCoords ? (
                    <div className="flex items-center gap-2 rounded-md border bg-green-50 dark:bg-green-950/20 px-3 py-2 text-sm text-green-700 dark:text-green-400">
                      <MapPin className="h-4 w-4 shrink-0" />
                      Location captured · ±{Math.round(qrGpsCoords.accuracy)}m accuracy
                    </div>
                  ) : qrGpsLoading ? (
                    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                      Getting your location…
                    </div>
                  ) : qrGpsError ? (
                    <div className="space-y-2">
                      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{qrGpsError}</div>
                      <Button variant="outline" size="sm" className="w-full" onClick={() => confirmQrToken()}>
                        <MapPin className="mr-2 h-3.5 w-3.5" />Retry Location
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                      Waiting for site QR scan…
                    </div>
                  )}
                </div>

                <Button
                  className="w-full h-12 text-base"
                  onClick={handleQrAttendance}
                  disabled={submitting || !qrTokenConfirmed || !qrGpsCoords}
                >
                  {submitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : siteRequiredCheckout ? <LogOut className="mr-2 h-5 w-5" /> : <LogIn className="mr-2 h-5 w-5" />}
                  Submit {siteRequiredCheckout ? "Check-out" : "Check-in"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <Button variant="ghost" size="sm" className="w-full" onClick={() => router.push("/dashboard/hr/attendance/my")}>
        View My Attendance History
      </Button>
    </div>
  );
}
