import { Navigate, Route, Routes } from "react-router-dom";

import { TransferLayout } from "./layout";
import { HomeRoute } from "./home";
import { ReceivedTextPage } from "./receive/components/received-text-page";
import { ReceiveRoute } from "./receive";
import { SendRoute } from "./send";

export function App() {
  return (
    <Routes>
      <Route element={<TransferLayout />}>
        <Route index element={<HomeRoute />} />
        <Route path="send" element={<SendRoute />} />
        <Route path="receive/text" element={<ReceivedTextPage />} />
        <Route path="receive" element={<ReceiveRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
