import { Navigate, Route, Routes } from "react-router-dom";

import { TransferLayout } from "./layout";
import { ClipboardRoute } from "@/routes/clipboard";
import { HomeRoute } from "@/routes/home";
import { ReceiveRoute } from "@/routes/receive";
import { SendRoute } from "@/routes/send";

export function App() {
  return (
    <Routes>
      <Route element={<TransferLayout />}>
        <Route index element={<HomeRoute />} />
        <Route path="send" element={<SendRoute />} />
        <Route path="receive" element={<ReceiveRoute />} />
        <Route path="clipboard" element={<ClipboardRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
