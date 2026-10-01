import { fireEvent, render, screen } from "@testing-library/react";
import ResumePlaybackDialog from "./ResumePlaybackDialog";

describe("ResumePlaybackDialog", () => {
  test("reste au-dessus des menus du lecteur et conserve les deux choix", () => {
    const onResume = jest.fn();
    const onRestart = jest.fn();

    render(
      <ResumePlaybackDialog
        open
        onOutsideClick={jest.fn()}
        onResume={onResume}
        onRestart={onRestart}
        resumeTimeLabel="12:34"
      />
    );

    expect(screen.getByTestId("resume-playback-dialog")).toHaveClass("z-[120]");
    expect(screen.getByText("12:34")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reprendre" }));
    fireEvent.click(screen.getByRole("button", { name: "Repartir du début" }));

    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onRestart).toHaveBeenCalledTimes(1);
  });
});
